import type { ChatMessage } from "./types";

export const samplePrompt =
  "Create empty page with table where you need to create 5 rows and 10 columns.";

export function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

export function formatMessageDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
