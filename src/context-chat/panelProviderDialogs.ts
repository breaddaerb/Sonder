import {
  CODEX_MODELS,
  getCurrentModel,
  getProvider,
  hasCodexCredentials,
  setCurrentModel,
  setProvider,
  getCustomApiConfig,
  setCustomApiConfig,
  hasCustomApiConfig,
  clearCustomApiConfig,
} from "../modules/provider";
import {
  clearCodexLogin,
  finishCodexOAuthLogin,
  getCodexLoginReport,
  startCodexOAuthLogin,
} from "../modules/Meet/CodexOAuth";
import { testCustomApiConnection } from "../modules/Meet/OpenAI";

export interface ProviderDialogContext {
  ownerWindow: Window;
  render: () => void;
  openCurrentContext: () => void;
}

export async function handleCodexAuth(ctx: ProviderDialogContext): Promise<void> {
  try {
    let provider = getProvider();
    if (provider != "openai-codex") {
      const shouldSwitch = ctx.ownerWindow.confirm("Switch provider to openai-codex and start Codex OAuth login?");
      if (!shouldSwitch) {
        return;
      }
      setProvider("openai-codex");
      provider = "openai-codex";
    }

    const report = getCodexLoginReport();
    if (report.hasPendingLogin) {
      const pasted = ctx.ownerWindow.prompt("Paste the redirect URL (or authorization code) to finish Codex login:", "");
      if (!pasted) {
        return;
      }
      const credentials = await finishCodexOAuthLogin(pasted);
      ctx.ownerWindow.alert(`Codex login succeeded. accountId: ${credentials.accountId.slice(0, 6)}... model: ${getCurrentModel("openai-codex")}`);
      ctx.render();
      return;
    }

    if (hasCodexCredentials()) {
      const shouldLogout = ctx.ownerWindow.confirm("Codex is already logged in. Logout now?");
      if (!shouldLogout) {
        return;
      }
      clearCodexLogin();
      ctx.ownerWindow.alert("Cleared Codex OAuth credentials.");
      ctx.render();
      return;
    }

    const auth = await startCodexOAuthLogin();
    Zotero.launchURL(auth.url);
    ctx.ownerWindow.alert([
      "Opened ChatGPT login page in your browser.",
      "",
      "After browser redirect fails on localhost (expected), copy the full URL.",
      "Then click 'Finish Login' in panel header and paste it.",
    ].join("\n"));
    ctx.render();
  } catch (error: any) {
    ctx.ownerWindow.alert(String(error?.message || error || "Codex auth failed."));
    ctx.render();
  }
}

export async function handleCodexModelConfig(ctx: ProviderDialogContext): Promise<void> {
  try {
    if (getProvider() != "openai-codex") {
      return;
    }
    const current = getCurrentModel("openai-codex");
    const options = CODEX_MODELS.join(", ");
    const next = ctx.ownerWindow.prompt(
      `Current Codex model: ${current}\n\nAvailable models:\n${options}\n\nEnter model name:`,
      current,
    );
    if (next === null) {
      return;
    }
    const trimmed = next.trim();
    if (!trimmed) {
      ctx.ownerWindow.alert("Model cannot be empty.");
      return;
    }
    setCurrentModel(trimmed, "openai-codex");
    ctx.ownerWindow.alert(`Codex model set to: ${trimmed}`);
    ctx.render();
  } catch (error: any) {
    ctx.ownerWindow.alert(String(error?.message || error || "Failed to set Codex model."));
    ctx.render();
  }
}

export async function handleCustomApiConfig(ctx: ProviderDialogContext): Promise<void> {
  try {
    const provider = getProvider();

    // If already configured, offer reconfigure or clear
    if (provider == "openai-api" && hasCustomApiConfig()) {
      const currentCfg = getCustomApiConfig();
      const action = ctx.ownerWindow.confirm(
        `Custom API is configured:\n\nBase URL: ${currentCfg.baseUrl}\nModel: ${currentCfg.model}\n\nClick OK to reconfigure, or Cancel to clear the current configuration.`
      );
      if (!action) {
        const shouldClear = ctx.ownerWindow.confirm("Clear the current custom API configuration?");
        if (shouldClear) {
          clearCustomApiConfig();
          ctx.ownerWindow.alert("Custom API configuration cleared.");
        }
        ctx.render();
        return;
      }
    }

    // If currently on Codex, ask to switch
    if (provider == "openai-codex") {
      const shouldSwitch = ctx.ownerWindow.confirm("Switch provider from Codex to custom API?");
      if (!shouldSwitch) {
        return;
      }
      setProvider("openai-api");
    }

    // Step 1: Base URL
    const currentCfg = getCustomApiConfig();
    const baseUrl = ctx.ownerWindow.prompt(
      "Enter the API base URL (OpenAI-compatible endpoint):",
      currentCfg.baseUrl || "https://api.openai.com"
    );
    if (baseUrl === null) {
      return;
    }
    const trimmedBaseUrl = baseUrl.trim();
    if (!trimmedBaseUrl) {
      ctx.ownerWindow.alert("Base URL cannot be empty.");
      return;
    }

    // Step 2: API Key
    const existingKeyHint = currentCfg.apiKey
      ? `${currentCfg.apiKey.slice(0, 4)}${"*".repeat(Math.min(20, Math.max(0, currentCfg.apiKey.length - 8)))}${currentCfg.apiKey.slice(-4)}`
      : "";
    const apiKey = ctx.ownerWindow.prompt(
      "Enter your API key:",
      existingKeyHint
    );
    if (apiKey === null) {
      return;
    }
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      ctx.ownerWindow.alert("API key cannot be empty.");
      return;
    }
    // If user didn't change the masked key, keep the original
    const finalApiKey = trimmedApiKey === existingKeyHint ? currentCfg.apiKey : trimmedApiKey;

    // Step 3: Model Name
    const model = ctx.ownerWindow.prompt(
      "Enter the model name (e.g. gpt-4o, deepseek-chat, claude-3.5-sonnet):",
      currentCfg.model || "gpt-4o"
    );
    if (model === null) {
      return;
    }
    const trimmedModel = model.trim();
    if (!trimmedModel) {
      ctx.ownerWindow.alert("Model name cannot be empty.");
      return;
    }

    // Step 4: Test Connection
    ctx.ownerWindow.alert("Testing connection... This may take a few seconds.");
    const result = await testCustomApiConnection(trimmedBaseUrl, finalApiKey, trimmedModel);

    if (result.success) {
      setCustomApiConfig({ baseUrl: trimmedBaseUrl, apiKey: finalApiKey, model: trimmedModel });
      ctx.ownerWindow.alert(`Connection successful!\n\nModel: ${result.model}\nBase URL: ${trimmedBaseUrl}\n\nConfiguration saved.`);
      // Re-initialize context to clear any stale error state from paper
      // preparation that may have failed while blocking config dialogs were open.
      void ctx.openCurrentContext();
      return;
    } else {
      ctx.ownerWindow.alert(`Connection failed:\n\n${result.error}\n\nConfiguration was NOT saved. Please check your base URL, API key, and model name.`);
    }
    ctx.render();
  } catch (error: any) {
    ctx.ownerWindow.alert(String(error?.message || error || "Custom API configuration failed."));
    ctx.render();
  }
}
