import { requestProviderChat, TransportChatMessage } from "../modules/Meet/OpenAI";
import { getCurrentModel, getProvider } from "../modules/provider";
import ContextChatStore from "./storage";
import { toChatHistory } from "./chatMessages";
import { SessionSnapshot } from "./types";

export interface SendMessageCallbacks {
  onUserSnapshot?: (snapshot: SessionSnapshot) => void;
  onAssistantDelta?: (text: string) => void;
}

export class ContextChatService {
  constructor(private readonly store: ContextChatStore) {}

  public async sendMessage(
    sessionId: string,
    content: string,
    callbacks: SendMessageCallbacks = {}
  ): Promise<SessionSnapshot> {
    const provider = getProvider();
    const model = getCurrentModel(provider);

    let snapshot = await this.store.appendMessage(sessionId, "user", content, { provider, model });
    if (!snapshot) {
      throw new Error("Session not found while saving the user message.");
    }
    callbacks.onUserSnapshot?.(snapshot);

    const history = toChatHistory(snapshot.messages) as TransportChatMessage[];
    const result = await requestProviderChat(history, {
      onText(text) {
        callbacks.onAssistantDelta?.(text);
      },
    });

    snapshot = await this.store.appendMessage(sessionId, "assistant", result.content, {
      provider: result.provider,
      model: result.model,
    });
    if (!snapshot) {
      throw new Error("Session not found while saving the assistant response.");
    }
    return snapshot;
  }
}

export default ContextChatService;
