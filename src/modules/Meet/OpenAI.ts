import { config } from "../../../package.json";
import { MD5 } from "crypto-js"
import { Document } from "langchain/document";
import LocalStorage from "../localStorage";
import { LegacyViewsCompat } from "../LegacyViewsShim";
import Meet from "./api";
import { getValidCodexAccessToken } from "./CodexOAuth";
import { getCurrentModel, getProvider, supportsEmbeddings } from "../provider";
const similarity = require('compute-cosine-similarity');

declare type RequestArg = { headers: any, api: string, body: Function, remove?: string | RegExp, process?: Function }
let chatID: string
const requestArgs: RequestArg[] = [
  {
    api: "https://aigpt.one/api/chat-stream",
    headers: {
      "path": "v1/chat/completions"
    },
    body: (requestText: string, messages: any) => {
      return {
        "model": "gpt-3.5-turbo",
        messages: messages,
        stream: true,
        "max_tokens": 2000,
        "presence_penalty": 0
      }
    }
  },
  {
    api: "https://chatbot.theb.ai/api/chat-process",
    headers: {
    },
    body: (requestText: string, messages: any) => {
      return { "prompt": requestText, "options": { "parentMessageId": chatID } }
    },
    process: (text: string) => {
      const res = JSON.parse(text.split("\n").slice(-1)[0])
      chatID = res.id
      return res.text
    }
  }
]

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_INSTRUCTIONS = "You are a helpful assistant inside the Zotero plugin Sonder. Answer clearly, be concise when possible, and reply in the same language as the user's message unless they ask otherwise.";

function startStreamingOutput(views: LegacyViewsCompat) {
  const deltaTime = Zotero.Prefs.get(`${config.addonRef}.deltaTime`) as number
  let previewText = ""
  let responseText: string | undefined
  views.stopAlloutput()
  views.setText("")
  const id: number = window.setInterval(() => {
    if (responseText === undefined && previewText.length == 0) { return }
    if (previewText.length > 0 || responseText !== undefined) {
      views.setText(previewText)
    }
    if (responseText !== undefined && responseText === previewText) {
      views.setText(previewText, true)
      window.clearInterval(id)
    }
  }, deltaTime)
  views._ids.push({
    type: "output",
    id: id
  })
  return {
    setPreviewText(text: string) {
      previewText = text
    },
    finish(text: string) {
      previewText = text
      responseText = text
    }
  }
}

function parseOpenAIText(raw: string) {
  try {
    return (raw.match(/data: (.+)/g) || []).filter((s: string) => s.indexOf("content") >= 0).map((s: string) => {
      try {
        return JSON.parse(s.replace("data: ", "")).choices[0].delta.content.replace(/\n+/g, "\n")
      } catch {
        return false
      }
    }).filter(Boolean).join("")
  } catch {
    return ""
  }
}

function parseCodexStream(raw: string) {
  const textParts: string[] = []
  let errorText = ""
  const chunks = raw.replace(/\r/g, "").split("\n\n")
  chunks.forEach((chunk) => {
    const dataLines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
    if (dataLines.length == 0) { return }
    const data = dataLines.join("\n").trim()
    if (!data || data == "[DONE]") { return }
    try {
      const event = JSON.parse(data)
      if (event.type == "response.output_text.delta" || event.type == "response.refusal.delta") {
        textParts.push(String(event.delta || "").replace(/\n+/g, "\n"))
      } else if (event.type == "error") {
        errorText = event.message || JSON.stringify(event)
      } else if (event.type == "response.failed") {
        errorText = event.response?.error?.message || event.error?.message || JSON.stringify(event)
      }
    } catch { }
  })
  return {
    text: textParts.join(""),
    errorText,
  }
}

function buildCodexInput(messages: { role: "user" | "assistant"; content: string }[]) {
  return messages.map((message, index) => {
    if (message.role == "user") {
      return {
        role: "user",
        content: [
          {
            type: "input_text",
            text: message.content,
          }
        ]
      }
    }
    return {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: message.content,
          annotations: [],
        }
      ],
      status: "completed",
      id: `msg_${index}`,
    }
  })
}

function formatCodexError(error: any) {
  const status = error?.status || error?.xmlhttp?.status
  const body = error?.xmlhttp?.responseText || error?.xmlhttp?.response || error?.message || "Unknown error"
  let message = body
  try {
    const parsed = JSON.parse(body)
    message = parsed?.error?.message || parsed?.message || body
  } catch { }
  const title = status ? `Codex ${status}` : "Codex Error"
  return `# ${title}\n> ${CODEX_BASE_URL}\n\n${message}`
}

/**
 * 给定文本和文档，返回文档列表，返回最相似的几个
 * @param queryText
 * @param docs
 * @param obj
 * @returns
 */
export async function similaritySearch(queryText: string, docs: Document[], obj: { key: string }) {
  const storage = Meet.Global.storage = Meet.Global.storage || new LocalStorage(config.addonRef)
  await storage.lock.promise;
  const embeddings = new OpenAIEmbeddings() as any
  const id = MD5(docs.map((i: any) => i.pageContent).join("\n\n")).toString()
  await storage.lock
  const _vv = storage.get(obj, id)
  ztoolkit.log(_vv)
  let vv: any
  if (_vv) {
    Meet.Global.popupWin.createLine({ text: "Reading embeddings...", type: "default" })
    vv = _vv
  } else {
    Meet.Global.popupWin.createLine({ text: "Generating embeddings...", type: "default" })
    vv = await embeddings.embedDocuments(docs.map((i: any) => i.pageContent))
    window.setTimeout(async () => {
      await storage.set(obj, id, vv)
    })
  }

  const v0 = await embeddings.embedQuery(queryText)
  const relatedNumber = Zotero.Prefs.get(`${config.addonRef}.relatedNumber`) as number
  Meet.Global.popupWin.createLine({ text: `Searching ${relatedNumber} related content...`, type: "default" })
  const k = relatedNumber * 5
  const pp = vv.map((v: any) => similarity(v0, v));
  docs = [...pp].sort((a, b) => b - a).slice(0, k).map((p: number) => {
    return docs[pp.indexOf(p)]
  })
  return docs.sort((a, b) => b.pageContent.length - a.pageContent.length).slice(0, relatedNumber)
}

class OpenAIEmbeddings {
  constructor() {
  }
  private async request(input: string[]) {
    const views = Zotero[config.addonInstance].views as LegacyViewsCompat
    if (!supportsEmbeddings()) {
      views.setText("# Embeddings unavailable\n> The current provider does not support embeddings. Switch to `/provider openai-api` to use retrieval mode.", true)
      throw new Error("Embeddings are unavailable for the current provider.")
    }
    let api = Zotero.Prefs.get(`${config.addonRef}.api`) as string
    api = api.replace(/\/(?:v1)?\/?$/, "")
    const secretKey = Zotero.Prefs.get(`${config.addonRef}.secretKey`)
    const split_len = Number(Zotero.Prefs.get(`${config.addonRef}.embeddingBatchNum`) || 10)
    let res
    const url = `${api}/v1/embeddings`
    if (!secretKey) {
      new ztoolkit.ProgressWindow(url, { closeOtherProgressWindows: true })
        .createLine({ text: "Your secretKey is not configured.", type: "default" })
        .show()
      throw new Error("Your secretKey is not configured.")
    }
    let final_embeddings: any[] = []
    for (let i = 0; i < input.length; i += split_len) {
      const chunk = input.slice(i, i + split_len)
      ztoolkit.log("input", chunk)
      try {
        res = await Zotero.HTTP.request(
          "POST",
          url,
          {
            responseType: "json",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${secretKey}`,
            },
            body: JSON.stringify({
              model: "text-embedding-ada-002",
              input: chunk
            }),
          }
        )
      } catch (error: any) {
        try {
          error = error.xmlhttp.response?.error
          views.setText(`# ${error.code}\n> ${url}\n\n**${error.type}**\n${error.message}`, true)
          new ztoolkit.ProgressWindow(error.code, { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        } catch {
          new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        }
        throw error
      }
      if (res?.response?.data) {
        final_embeddings = final_embeddings.concat(res.response.data.map((i: any) => i.embedding))
      }
    }
    return final_embeddings
  }

  public async embedDocuments(texts: string[]) {
    return await this.request(texts)
  }

  public async embedQuery(text: string) {
    return (await this.request([text]))?.[0]
  }
}

export type TransportChatMessage = { role: "user" | "assistant"; content: string };

export type TransportChatOptions = {
  onText?: (text: string) => void;
};

export type TransportChatResult = {
  provider: ReturnType<typeof getProvider>;
  model: string;
  content: string;
};

async function requestOpenAIChat(
  messages: TransportChatMessage[],
  options: TransportChatOptions = {}
): Promise<TransportChatResult> {
  const secretKey = Zotero.Prefs.get(`${config.addonRef}.secretKey`)
  const temperature = Zotero.Prefs.get(`${config.addonRef}.temperature`)
  let api = Zotero.Prefs.get(`${config.addonRef}.api`) as string
  api = api.replace(/\/+$/, "")
  const model = getCurrentModel("openai-api")
  const chatNumber = Zotero.Prefs.get(`${config.addonRef}.chatNumber`) as number
  const url = `${api}/chat/completions`
  let responseText = ""
  try {
    await Zotero.HTTP.request(
      "POST",
      url,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secretKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.slice(-chatNumber),
          stream: true,
          temperature: Number(temperature),
        }),
        responseType: "text",
        requestObserver: (xmlhttp: XMLHttpRequest) => {
          xmlhttp.onprogress = (e: any) => {
            responseText = parseOpenAIText(e.target.response)
            options.onText?.(responseText)
            if (e.target.timeout) {
              e.target.timeout = 0;
            }
          };
        },
      }
    );
  } catch (error: any) {
    try {
      const body = error?.xmlhttp?.response || error?.xmlhttp?.responseText;
      const raw = typeof body === "object" ? JSON.stringify(body) : String(body || "");
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
      const err = parsed?.error || parsed;
      responseText = `# ${err.code || "Error"}\n> ${url}\n\n**${err.type || "request_error"}**\n${err.message || raw || error?.message || "Unknown error"}`
      new ztoolkit.ProgressWindow(err.code || "Error", { closeOtherProgressWindows: true })
        .createLine({ text: err.message || "Request failed.", type: "default" })
        .show()
    } catch {
      responseText = `# Error\n> ${url}\n\n${error?.message || "Unknown error"}`
      new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
        .createLine({ text: error?.message || "Unknown error", type: "default" })
        .show()
    }
  }
  return {
    provider: "openai-api",
    model,
    content: responseText,
  }
}

async function requestCodexChat(
  messages: TransportChatMessage[],
  options: TransportChatOptions = {}
): Promise<TransportChatResult> {
  const model = getCurrentModel("openai-codex")
  const chatNumber = Zotero.Prefs.get(`${config.addonRef}.chatNumber`) as number
  let responseText = ""
  try {
    const credentials = await getValidCodexAccessToken()
    await Zotero.HTTP.request(
      "POST",
      CODEX_BASE_URL,
      {
        headers: {
          "Authorization": `Bearer ${credentials.access}`,
          "chatgpt-account-id": credentials.accountId,
          "OpenAI-Beta": "responses=experimental",
          "originator": "sonder",
          "accept": "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          stream: true,
          instructions: CODEX_INSTRUCTIONS,
          input: buildCodexInput(messages.slice(-chatNumber)),
          text: { verbosity: "medium" },
        }),
        responseType: "text",
        requestObserver: (xmlhttp: XMLHttpRequest) => {
          xmlhttp.onprogress = (e: any) => {
            const parsed = parseCodexStream(e.target.response)
            responseText = parsed.errorText || parsed.text
            options.onText?.(responseText)
            if (e.target.timeout) {
              e.target.timeout = 0;
            }
          }
        },
      }
    )
  } catch (error: any) {
    responseText = formatCodexError(error)
    new ztoolkit.ProgressWindow("Codex", { closeOtherProgressWindows: true })
      .createLine({ text: error?.message || "Codex request failed.", type: "default" })
      .show()
  }
  return {
    provider: "openai-codex",
    model,
    content: responseText,
  }
}

async function requestFallbackChat(
  requestArg: RequestArg,
  messages: TransportChatMessage[],
  options: TransportChatOptions = {}
): Promise<TransportChatResult> {
  let responseText: string | undefined
  let previewText = ""
  const chatNumber = Zotero.Prefs.get(`${config.addonRef}.chatNumber`) as number
  const slicedMessages = messages.slice(-chatNumber)
  const requestText = slicedMessages[slicedMessages.length - 1]?.content || ""
  const body = JSON.stringify(requestArg.body(requestText, slicedMessages))
  try {
    await Zotero.HTTP.request(
      "POST",
      requestArg.api,
      {
        headers: {
          "Content-Type": "application/json",
          ...requestArg.headers,
        },
        body,
        responseType: "text",
        requestObserver: (xmlhttp: XMLHttpRequest) => {
          xmlhttp.onprogress = (e: any) => {
            previewText = e.target.response.replace(requestArg.remove, "")
            if (requestArg.process) {
              previewText = requestArg.process(previewText)
            }
            options.onText?.(previewText)
            if (e.target.timeout) {
              e.target.timeout = 0;
            }
          };
        },
      }
    );
    responseText = previewText
  } catch (error: any) {
    responseText = `# Request Error\n> ${requestArg.api}\n\n${error?.message || error}`
    new ztoolkit.ProgressWindow("Request Error", { closeOtherProgressWindows: true })
      .createLine({ text: error?.message || "Unknown request error.", type: "default" })
      .show()
  }
  return {
    provider: "openai-api",
    model: getCurrentModel("openai-api") || "fallback",
    content: responseText || "",
  }
}

export async function requestProviderChat(
  messages: TransportChatMessage[],
  options: TransportChatOptions = {}
): Promise<TransportChatResult> {
  const provider = getProvider()
  if (provider == "openai-codex") {
    return await requestCodexChat(messages, options)
  }
  const secretKey = Zotero.Prefs.get(`${config.addonRef}.secretKey`)
  if (!secretKey) {
    return await requestFallbackChat(requestArgs[1], messages, options)
  }
  return await requestOpenAIChat(messages, options)
}

export async function getGPTResponse(requestText: string) {
  const provider = getProvider()
  if (provider == "openai-codex") {
    return await getGPTResponseByCodex(requestText)
  }
  const secretKey = Zotero.Prefs.get(`${config.addonRef}.secretKey`)
  if (!secretKey) { return await getGPTResponseBy(requestArgs[1], requestText) }
  return await getGPTResponseByOpenAI(requestText)
}

export async function getGPTResponseByOpenAI(requestText: string) {
  const views = Zotero[config.addonInstance].views as LegacyViewsCompat
  views.messages.push({
    role: "user",
    content: requestText
  })
  const streaming = startStreamingOutput(views)
  const result = await requestOpenAIChat(views.messages as TransportChatMessage[], {
    onText(text) {
      streaming.setPreviewText(text)
    }
  })
  streaming.finish(result.content)
  views.messages.push({
    role: "assistant",
    content: result.content
  })
  return result.content
}

export async function getGPTResponseByCodex(requestText: string) {
  const views = Zotero[config.addonInstance].views as LegacyViewsCompat
  views.messages.push({
    role: "user",
    content: requestText,
  })
  const streaming = startStreamingOutput(views)
  const result = await requestCodexChat(views.messages as TransportChatMessage[], {
    onText(text) {
      streaming.setPreviewText(text)
    }
  })
  streaming.finish(result.content)
  views.messages.push({
    role: "assistant",
    content: result.content,
  })
  return result.content
}

/**
 * 返回值要是纯文本
 * @param requestArg
 * @param requestText
 * @param views
 * @returns
 */
export async function getGPTResponseBy(
  requestArg: RequestArg,
  requestText: string,
) {
  const views = Zotero[config.addonInstance].views as LegacyViewsCompat
  views.messages.push({
    role: "user",
    content: requestText
  })
  const streaming = startStreamingOutput(views)
  const result = await requestFallbackChat(requestArg, views.messages as TransportChatMessage[], {
    onText(text) {
      streaming.setPreviewText(text)
    }
  })
  streaming.finish(result.content)
  views.messages.push({
    role: "assistant",
    content: result.content
  })
  return result.content
}

// --- Custom API connection test ---

export type TestConnectionResult =
  | { success: true; model: string }
  | { success: false; error: string };

export async function testCustomApiConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<TestConnectionResult> {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const url = `${normalizedBase}/chat/completions`;
  try {
    const response = await Zotero.HTTP.request(
      "POST",
      url,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hi" }],
        }),
        responseType: "json",
        timeout: 15000,
      },
    );
    const data = response?.response;
    const returnedModel = data?.model || model;
    if (data?.choices?.length > 0) {
      return { success: true, model: returnedModel };
    }
    return { success: true, model: returnedModel };
  } catch (error: any) {
    let message = error?.message || "Unknown error";
    try {
      const body = error?.xmlhttp?.response || error?.xmlhttp?.responseText;
      if (body) {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        message = parsed?.error?.message || parsed?.message || message;
      }
    } catch {
      // keep original message
    }
    const status = error?.status || error?.xmlhttp?.status;
    if (status) {
      message = `HTTP ${status}: ${message}`;
    }
    return { success: false, error: message };
  }
}
