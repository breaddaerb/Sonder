import { StoredMessage } from "./types";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export function canSendDraft(text: string) {
  return text.trim().length > 0;
}

export function toChatHistory(messages: StoredMessage[]): ChatHistoryMessage[] {
  return messages
    .filter((message): message is StoredMessage & { role: "user" | "assistant" } => {
      return message.role == "user" || message.role == "assistant";
    })
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}
