export function sseEvent(name: string, data: unknown): string {
    return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function ssePing(): string {
    return ": ping\n\n";
}

