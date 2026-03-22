import prisma from "@/lib/prisma";

export interface RankedGameResult {
    id: string;
    appId: number | null;
    name: string;
    shortDescription: string | null;
    metacriticScore: number | null;
    isFree: boolean;
    releaseDate: Date | null;
    type: string;
    platforms: string[];
    developers: string[];
    publishers: string[];
    rank: number;
}

/**
 * Sanitize user input into a valid tsquery string.
 * Splits on whitespace, removes non-alphanumeric chars, joins with & and appends :* for prefix matching.
 */
function buildTsQuery(raw: string): string | null {
    const tokens = raw
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter((t) => t.length > 0);

    if (tokens.length === 0) return null;

    return tokens.map((t) => `${t}:*`).join(" & ");
}

/**
 * Escape special characters for LIKE / ILIKE patterns.
 */
function escapeLike(s: string): string {
    return s.replace(/[%_\\]/g, "\\$&");
}

/**
 * Perform a ranked full-text search on the Game table.
 *
 * Ranking tiers (higher = better):
 *   3 - exact name match (case-insensitive)
 *   2 - name starts with the query (prefix)
 *   1 - full-text vector match (weighted A/B/C/D)
 *
 * Within a tier, results are ordered by ts_rank_cd score descending,
 * then by metacritic score as a tiebreaker.
 */
export async function searchGamesRanked(
    query: string,
    limit: number = 8,
): Promise<RankedGameResult[]> {
    const q = query.trim();
    if (!q) return [];

    const tsq = buildTsQuery(q);
    const likePattern = `${escapeLike(q)}%`;

    if (!tsq) {
        return prisma.$queryRaw<RankedGameResult[]>`
            SELECT
                "id", "appId", "name", "shortDescription",
                "metacriticScore", "isFree", "releaseDate", "type",
                "platforms"::text[] AS "platforms",
                "developers", "publishers",
                CASE
                    WHEN lower("name") = lower(${q}) THEN 3
                    WHEN lower("name") LIKE lower(${likePattern}) THEN 2
                    ELSE 1
                END AS "rank"
            FROM "Game"
            WHERE lower("name") LIKE lower(${'%' + escapeLike(q) + '%'})
            ORDER BY "rank" DESC, "metacriticScore" DESC NULLS LAST, "name" ASC
            LIMIT ${limit}
        `;
    }

    return prisma.$queryRaw<RankedGameResult[]>`
        SELECT
            "id", "appId", "name", "shortDescription",
            "metacriticScore", "isFree", "releaseDate", "type",
            "platforms"::text[] AS "platforms",
            "developers", "publishers",
            CASE
                WHEN lower("name") = lower(${q}) THEN 300
                WHEN lower("name") LIKE lower(${likePattern}) THEN 200 + ts_rank_cd("search_vector", to_tsquery('english', ${tsq}))
                WHEN "search_vector" @@ to_tsquery('english', ${tsq}) THEN 100 + ts_rank_cd("search_vector", to_tsquery('english', ${tsq}))
                ELSE ts_rank_cd("search_vector", to_tsquery('english', ${tsq}))
            END AS "rank"
        FROM "Game"
        WHERE
            "search_vector" @@ to_tsquery('english', ${tsq})
            OR lower("name") LIKE lower(${'%' + escapeLike(q) + '%'})
        ORDER BY "rank" DESC, "metacriticScore" DESC NULLS LAST, "name" ASC
        LIMIT ${limit}
    `;
}

/**
 * Lightweight version: returns only IDs + rank for use in explorer filtering.
 */
export async function searchGameIds(
    query: string,
    pagination: { limit: number; offset: number } = { limit: 500, offset: 0 },
): Promise<{ ids: string[]; total: number }> {
    const q = query.trim();
    if (!q) return { ids: [], total: 0 };

    const tsq = buildTsQuery(q);
    const likePattern = `${escapeLike(q)}%`;
    const fuzzyPattern = `%${escapeLike(q)}%`;
    const { limit, offset } = pagination;

    if (!tsq) {
        const [rows, countResult] = await Promise.all([
            prisma.$queryRaw<{ id: string }[]>`
                SELECT "id"
                FROM "Game"
                WHERE lower("name") LIKE lower(${fuzzyPattern})
                ORDER BY
                    CASE
                        WHEN lower("name") = lower(${q}) THEN 3
                        WHEN lower("name") LIKE lower(${likePattern}) THEN 2
                        ELSE 1
                    END DESC,
                    "name" ASC
                LIMIT ${limit} OFFSET ${offset}
            `,
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count
                FROM "Game"
                WHERE lower("name") LIKE lower(${fuzzyPattern})
            `,
        ]);

        return {
            ids: rows.map((r) => r.id),
            total: Number(countResult[0].count),
        };
    }

    const [rows, countResult] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`
            SELECT "id"
            FROM "Game"
            WHERE
                "search_vector" @@ to_tsquery('english', ${tsq})
                OR lower("name") LIKE lower(${fuzzyPattern})
            ORDER BY
                CASE
                    WHEN lower("name") = lower(${q}) THEN 300
                    WHEN lower("name") LIKE lower(${likePattern}) THEN 200 + ts_rank_cd("search_vector", to_tsquery('english', ${tsq}))
                    WHEN "search_vector" @@ to_tsquery('english', ${tsq}) THEN 100 + ts_rank_cd("search_vector", to_tsquery('english', ${tsq}))
                    ELSE ts_rank_cd("search_vector", to_tsquery('english', ${tsq}))
                END DESC,
                "name" ASC
            LIMIT ${limit} OFFSET ${offset}
        `,
        prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count
            FROM "Game"
            WHERE
                "search_vector" @@ to_tsquery('english', ${tsq})
                OR lower("name") LIKE lower(${fuzzyPattern})
        `,
    ]);

    return {
        ids: rows.map((r) => r.id),
        total: Number(countResult[0].count),
    };
}

