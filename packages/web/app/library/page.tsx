'use client';

import {GameList} from "@/components/game/game-list";
import {Header} from "@/components/header";
import {JobStatusCard} from "@/components/job-status";
import {LoadingIndicator} from "@/components/shared/loading-indicator";
import {useServerQuery} from "@/lib/hooks/use-server-query";
import {useSession} from "@/lib/providers/session";
import {cn} from "@/lib/utils";
import {JobType} from "@/prisma/generated/browser";
import {getGameCategories, getGameGenres} from "@/server/queries/games";
import {getGamesForUser} from "@/server/queries/user-games";

export default function Home() {
    const { user, isLoading: sessionLoading } = useSession();

    const { data: gamesResult, isLoading: gamesLoading, isRevalidating } = useServerQuery(
        user ? ["games", user.id] : null, () => getGamesForUser()
    );

    const { data: categoriesResult } = useServerQuery(
        ["categories"], () => getGameCategories()
    );

    const { data: genresResult } = useServerQuery(
        ["genres"], () => getGameGenres()
    );

    const isLoading = sessionLoading || gamesLoading || gamesResult === undefined;
    const games = gamesResult?.success ? gamesResult.data : [];
    const categories = categoriesResult?.success ? categoriesResult.data : [];
    const genres = genresResult?.success ? genresResult.data : [];

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                <JobStatusCard jobType={JobType.IMPORT_USER_LIBRARY} />

                <div className={cn(
                    "relative flex justify-center transition-opacity duration-200"
                )}>                    
                    <GameList
                        games={games}
                        categories={categories}
                        genres={genres}
                        isLoading={isLoading}
                    />
                </div>
            </div>
            
            <LoadingIndicator show={isRevalidating} />
        </>
    );
}