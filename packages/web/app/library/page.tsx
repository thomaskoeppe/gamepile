'use client';

import {GameList} from "@/components/game/game-list";
import {Header} from "@/components/header";
import {JobStatusCard} from "@/components/job-status";
import {LoadingIndicator} from "@/components/shared/loading-indicator";
import {useServerQuery} from "@/lib/hooks/use-server-query";
import {useSession} from "@/lib/providers/session";
import {cn} from "@/lib/utils";
import {JobType} from "@/prisma/generated/browser";
import {getGameCategories, getGameTags} from "@/server/queries/games";
import {getGamesForUser} from "@/server/queries/user-games";

export default function Home() {
    const { user, isLoading: sessionLoading } = useSession();

    const { data: gamesResult, isLoading: gamesLoading, isRevalidating } = useServerQuery(
        user ? ["games", user.id] : null, () => getGamesForUser()
    );

    const { data: categoriesResult } = useServerQuery(
        ["categories"], () => getGameCategories()
    );

    const {data: tagsResult} = useServerQuery(
        ["tags"], () => getGameTags()
    );

    const isLoading = sessionLoading || gamesLoading || gamesResult === undefined;
    const games = gamesResult?.success ? gamesResult.data : [];
    const categories = categoriesResult?.success ? categoriesResult.data : [];
    const tags = tagsResult?.success ? tagsResult.data : [];

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
                        tags={tags}
                        isLoading={isLoading}
                    />
                </div>
            </div>
            
            <LoadingIndicator show={isRevalidating} />
        </>
    );
}