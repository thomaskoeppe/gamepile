import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const MIGRATIONS_DIR = process.env.SQL_MIGRATIONS_DIR
    ? path.resolve(process.env.SQL_MIGRATIONS_DIR)
    : path.resolve(repoRoot, "packages/web/prisma/migrations");

function writeOut(message) {
    process.stdout.write(`[migrate] ${message}\n`);
}

function writeErr(message) {
    process.stderr.write(`[migrate] ${message}\n`);
}

function assertDatabaseUrl() {
    if (!DATABASE_URL) {
        throw new Error("DATABASE_URL is required");
    }
}

async function listMigrationFiles() {
    await access(MIGRATIONS_DIR);

    const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isDirectory() && /^\d+_.+/.test(entry.name))
        .map((entry) => ({
            name: entry.name,
            filePath: path.join(MIGRATIONS_DIR, entry.name, "migration.sql"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function ensureMigrationTable(sql) {
    await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            checksum TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function migrationChecksum(filePath) {
    const fileContent = await readFile(filePath, "utf8");
    const checksum = createHash("sha256").update(fileContent).digest("hex");

    return { fileContent, checksum };
}

async function bootstrapFromPrismaHistory(sql, migrations) {
    const hasPrismaMigrationsTable = await sql`
        SELECT to_regclass('_prisma_migrations') AS table_name
    `;

    if (!hasPrismaMigrationsTable[0]?.table_name) {
        return;
    }

    const alreadyTracked = await sql`
        SELECT COUNT(*)::int AS count
        FROM schema_migrations
    `;

    if ((alreadyTracked[0]?.count ?? 0) > 0) {
        return;
    }

    const prismaApplied = await sql`
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
    `;

    const appliedNames = new Set(prismaApplied.map((row) => row.migration_name));
    if (appliedNames.size === 0) {
        return;
    }

    let imported = 0;

    for (const migration of migrations) {
        if (!appliedNames.has(migration.name)) {
            continue;
        }

        const { checksum } = await migrationChecksum(migration.filePath);
        await sql`
            INSERT INTO schema_migrations (name, checksum)
            VALUES (${migration.name}, ${checksum})
            ON CONFLICT (name) DO NOTHING
        `;
        imported += 1;
    }

    if (imported > 0) {
        writeOut(`bootstrapped ${imported} migrations from _prisma_migrations`);
    }
}

async function applyMigration(sql, migration) {
    const { fileContent, checksum } = await migrationChecksum(migration.filePath);

    const existing = await sql`
        SELECT name, checksum
        FROM schema_migrations
        WHERE name = ${migration.name}
        LIMIT 1
    `;

    if (existing.length > 0) {
        if (existing[0].checksum !== checksum) {
            throw new Error(`Checksum mismatch for already-applied migration: ${migration.name}`);
        }

        writeOut(`skip ${migration.name}`);
        return;
    }

    writeOut(`apply ${migration.name}`);

    await sql.begin(async (tx) => {
        await tx.unsafe(fileContent);
        await tx`
            INSERT INTO schema_migrations (name, checksum)
            VALUES (${migration.name}, ${checksum})
        `;
    });

    writeOut(`done ${migration.name}`);
}

/**
 * Strip Prisma-specific query parameters (e.g. ?schema=public) that the raw
 * `postgres` driver does not understand and would forward to PostgreSQL as
 * unrecognised configuration parameters.
 */
function sanitizeDatabaseUrl(url) {
    const parsed = new URL(url);
    parsed.searchParams.delete("schema");
    return parsed.toString();
}

async function run() {
    assertDatabaseUrl();

    const sql = postgres(sanitizeDatabaseUrl(DATABASE_URL), {
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
    });

    try {
        await sql`SELECT pg_advisory_lock(hashtext('gamepile_sql_migrations'))`;
        await ensureMigrationTable(sql);

        const migrations = await listMigrationFiles();
        await bootstrapFromPrismaHistory(sql, migrations);
        writeOut(`found ${migrations.length} migrations in ${MIGRATIONS_DIR}`);

        for (const migration of migrations) {
            await applyMigration(sql, migration);
        }

        writeOut("all migrations applied");
    } finally {
        try {
            await sql`SELECT pg_advisory_unlock(hashtext('gamepile_sql_migrations'))`;
        } catch {
            // Connection may already be closed; unlock best-effort only.
        }

        await sql.end({ timeout: 5 });
    }
}

run().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    writeErr(message);
    process.exitCode = 1;
});

