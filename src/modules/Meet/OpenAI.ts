import { config } from "../../../package.json";
import { getValidCodexAccessToken } from "./CodexOAuth";
import { getCurrentModel, getProvider } from "../provider";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_INSTRUCTIONS = "You are a helpful assistant inside the Zotero plugin Sonder. Answer clearly, be concise when possible, and reply in the same language as the user's message unless they ask otherwise.";

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
    return {
      provider: "openai-api",
      model: getCurrentModel("openai-api") || "",
      content: "# Configuration Required\n\nNo API key is configured. Use **Configure API** in the panel header to set up an OpenAI-compatible endpoint, or **Enable Codex** to use ChatGPT OAuth.",
    }
  }
  return await requestOpenAIChat(messages, options)
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
