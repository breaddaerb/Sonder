import { requestProviderChat, TransportChatMessage } from "../modules/Meet/OpenAI";
import { getCurrentModel, getProvider } from "../modules/provider";
import ContextChatStore from "./storage";
import { toChatHistory } from "./chatMessages";
import {
  buildItemPaperGroundedUserMessage,
  buildPaperGroundedUserMessage,
  createPaperChunkCitations,
  filterChunksByPageRange,
  parseCitedIndices,
  PreparedPaperContext,
  readCurrentReaderPaperChunks,
} from "./paperRetrieval";
import { Citation, PageRange, SessionSnapshot, StoredContext } from "./types";

export type PaperContextStatus = "idle" | "preparing" | "ready" | "failed";

export interface PaperContextState {
  status: PaperContextStatus;
  error?: string;
}

export interface SendMessageCallbacks {
  onUserSnapshot?: (snapshot: SessionSnapshot) => void;
  onAssistantDelta?: (text: string) => void;
  onPaperStatusChange?: (state: PaperContextState) => void;
}

export class ContextChatService {
  private readonly preparedPapers = new Map<string, PreparedPaperContext>();
  private readonly paperPreparationPromises = new Map<string, Promise<PreparedPaperContext>>();
  private readonly paperStates = new Map<string, PaperContextState>();

  constructor(private readonly store: ContextChatStore) {}

  public getPaperContextState(contextId: string): PaperContextState {
    return this.paperStates.get(contextId) || { status: "idle" };
  }

  public preparePaperContext(
    context: StoredContext,
    onStatusChange?: (state: PaperContextState) => void,
  ) {
    if (!context.paperKey) {
      return;
    }
    if (this.getPaperContextState(context.id).status == "ready") {
      onStatusChange?.({ status: "ready" });
      return;
    }
    void this.ensurePreparedPaperContext(context, onStatusChange).catch(() => {
      // Error state is already surfaced through callbacks/state.
    });
  }

  private updatePaperState(
    contextId: string,
    state: PaperContextState,
    onStatusChange?: (state: PaperContextState) => void,
  ) {
    this.paperStates.set(contextId, state);
    onStatusChange?.(state);
  }

  private async ensurePreparedPaperContext(
    context: StoredContext,
    onStatusChange?: (state: PaperContextState) => void,
  ) {
    if (!context.paperKey) {
      throw new Error("Paper key is required to prepare retrieval context.");
    }
    const cached = this.preparedPapers.get(context.id);
    if (cached) {
      this.updatePaperState(context.id, { status: "ready" }, onStatusChange);
      return cached;
    }
    const pending = this.paperPreparationPromises.get(context.id);
    if (pending) {
      this.updatePaperState(context.id, { status: "preparing" }, onStatusChange);
      return await pending;
    }

    const promise = readCurrentReaderPaperChunks(context.paperKey, context.id, context.title)
      .then((prepared) => {
        this.preparedPapers.set(context.id, prepared);
        this.paperPreparationPromises.delete(context.id);
        this.updatePaperState(context.id, { status: "ready" }, onStatusChange);
        return prepared;
      })
      .catch((error: any) => {
        this.paperPreparationPromises.delete(context.id);
        this.updatePaperState(
          context.id,
          { status: "failed", error: String(error?.message || error || "Failed to prepare paper context.") },
          onStatusChange,
        );
        throw error;
      });

    this.paperPreparationPromises.set(context.id, promise);
    this.updatePaperState(context.id, { status: "preparing" }, onStatusChange);
    return await promise;
  }

  private buildTransportHistory(snapshot: SessionSnapshot, latestUserContent: string) {
    const history = toChatHistory(snapshot.messages) as TransportChatMessage[];
    const lastMessage = history[history.length - 1];
    if (lastMessage?.role == "user") {
      lastMessage.content = latestUserContent;
    }
    return history;
  }

  private buildAssistantCitations(
    context: StoredContext,
    relevantChunks: PreparedPaperContext["chunks"],
    assistantResponseText: string,
  ): Citation[] {
    // Only show citation chips for chunks the model explicitly cited in its response.
    const citedIndices = parseCitedIndices(assistantResponseText, relevantChunks.length);
    const citedChunks = citedIndices.map((i) => relevantChunks[i - 1]);
    const citations = createPaperChunkCitations(citedChunks, citedIndices);

    if (context.type == "item+paper" && context.itemKey) {
      citations.unshift({
        id: `item:${context.itemKey}`,
        label: context.itemKind == "note" ? "Selected note" : "Selected annotation",
        sourceType: "item",
        target: `item:${context.libraryID || ""}:${context.itemKey}`,
        preview: context.itemText?.slice(0, 240),
      });
    }
    return citations;
  }

  public async sendMessage(
    sessionId: string,
    content: string,
    callbacks: SendMessageCallbacks = {},
    pageRange?: PageRange,
  ): Promise<SessionSnapshot> {
    const provider = getProvider();
    const model = getCurrentModel(provider);

    let snapshot = await this.store.appendMessage(sessionId, "user", content, { provider, model });
    if (!snapshot) {
      throw new Error("Session not found while saving the user message.");
    }
    callbacks.onUserSnapshot?.(snapshot);

    let preparedPaper: PreparedPaperContext | undefined;
    try {
      preparedPaper = await this.ensurePreparedPaperContext(snapshot.context, callbacks.onPaperStatusChange);
    } catch {
      preparedPaper = {
        contextId: snapshot.context.id,
        paperKey: snapshot.context.paperKey || "",
        title: snapshot.context.title,
        preparedAt: Date.now(),
        chunks: [],
      };
    }

    // Send all paper chunks (one per page), optionally filtered by user-specified page range.
    const contextChunks = filterChunksByPageRange(preparedPaper.chunks, pageRange);
    const groundedUserMessage = snapshot.context.type == "item+paper"
      ? buildItemPaperGroundedUserMessage({
          paperTitle: preparedPaper.title,
          itemKind: snapshot.context.itemKind || "annotation",
          itemText: snapshot.context.itemText || "(Selected item content unavailable)",
          question: content,
          chunks: contextChunks,
        })
      : buildPaperGroundedUserMessage({
          title: preparedPaper.title,
          question: content,
          chunks: contextChunks,
        });
    const transportHistory = this.buildTransportHistory(snapshot, groundedUserMessage);

    const result = await requestProviderChat(transportHistory, {
      onText(text) {
        callbacks.onAssistantDelta?.(text);
      },
    });

    snapshot = await this.store.appendMessage(sessionId, "assistant", result.content, {
      provider: result.provider,
      model: result.model,
      citations: this.buildAssistantCitations(snapshot.context, contextChunks, result.content),
    });
    if (!snapshot) {
      throw new Error("Session not found while saving the assistant response.");
    }
    return snapshot;
  }
}

export default ContextChatService;
