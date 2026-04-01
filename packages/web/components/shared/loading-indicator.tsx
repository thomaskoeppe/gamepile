"use client";

export function LoadingIndicator({ show }: { show: boolean }) {
    return (
        <>
            {show ? (
                <div className="absolute inset-x-0 bottom-0 z-10 h-0.75 overflow-hidden rounded-full">
                    <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
                </div>
            ) : (
                <div className="absolute inset-x-0 bottom-0 z-10 h-0.75" />
            )}
        </>
    );
}