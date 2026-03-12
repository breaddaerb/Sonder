import assert from "node:assert/strict";

// Mock Zotero.Prefs for testing provider helpers in Node environment
const mockPrefs = new Map<string, any>();

(globalThis as any).Zotero = {
  Prefs: {
    get(key: string) {
      return mockPrefs.get(key);
    },
    set(key: string, value: any) {
      mockPrefs.set(key, value);
    },
  },
};

// Import after mock is set up
import {
  getCustomApiConfig,
  setCustomApiConfig,
  hasCustomApiConfig,
  clearCustomApiConfig,
  getCustomApiStatusLabel,
  getProvider,
  setProvider,
  getCurrentModel,
} from "../src/modules/provider";

// --- Test: getCustomApiConfig returns defaults when prefs are empty ---
mockPrefs.clear();
{
  const cfg = getCustomApiConfig();
  assert.equal(cfg.baseUrl, "https://api.openai.com", "default baseUrl");
  assert.equal(cfg.apiKey, "", "default apiKey is empty");
  assert.equal(cfg.model, "gpt-4o", "default model");
}

// --- Test: setCustomApiConfig writes all three fields ---
mockPrefs.clear();
{
  setCustomApiConfig({
    baseUrl: "https://api.deepseek.com",
    apiKey: "sk-test-key-123",
    model: "deepseek-chat",
  });
  const cfg = getCustomApiConfig();
  assert.equal(cfg.baseUrl, "https://api.deepseek.com");
  assert.equal(cfg.apiKey, "sk-test-key-123");
  assert.equal(cfg.model, "deepseek-chat");
}

// --- Test: hasCustomApiConfig returns true when both baseUrl and apiKey are set ---
mockPrefs.clear();
{
  assert.equal(hasCustomApiConfig(), false, "empty prefs => false");

  setCustomApiConfig({
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-4o",
  });
  assert.equal(hasCustomApiConfig(), false, "empty apiKey => false");

  setCustomApiConfig({
    baseUrl: "https://api.openai.com",
    apiKey: "sk-real-key",
    model: "gpt-4o",
  });
  assert.equal(hasCustomApiConfig(), true, "both set => true");
}

// --- Test: clearCustomApiConfig resets to defaults ---
mockPrefs.clear();
{
  setCustomApiConfig({
    baseUrl: "https://custom.endpoint.com",
    apiKey: "sk-custom",
    model: "custom-model",
  });
  assert.equal(hasCustomApiConfig(), true);

  clearCustomApiConfig();
  const cfg = getCustomApiConfig();
  assert.equal(cfg.baseUrl, "https://api.openai.com", "baseUrl reset to default");
  assert.equal(cfg.apiKey, "", "apiKey cleared");
  assert.equal(cfg.model, "gpt-4o", "model reset to default");
  assert.equal(hasCustomApiConfig(), false, "no longer configured");
}

// --- Test: getCustomApiStatusLabel returns correct labels ---
mockPrefs.clear();
{
  // When provider is openai-api and no config
  setProvider("openai-api");
  assert.equal(getCustomApiStatusLabel(), "Configure API", "unconfigured openai-api");

  // When provider is openai-codex
  setProvider("openai-codex");
  assert.equal(getCustomApiStatusLabel(), "Configure API", "codex provider");

  // When provider is openai-api and configured
  setProvider("openai-api");
  setCustomApiConfig({
    baseUrl: "https://api.openai.com",
    apiKey: "sk-key",
    model: "gpt-4o-mini",
  });
  assert.equal(getCustomApiStatusLabel(), "API: gpt-4o-mini", "configured shows model");
}

// --- Test: setCustomApiConfig with empty values uses defaults ---
mockPrefs.clear();
{
  setCustomApiConfig({
    baseUrl: "",
    apiKey: "",
    model: "",
  });
  const cfg = getCustomApiConfig();
  assert.equal(cfg.baseUrl, "https://api.openai.com", "empty baseUrl falls back to default");
  assert.equal(cfg.model, "gpt-4o", "empty model falls back to default");
}

// --- Test: provider and model integration ---
mockPrefs.clear();
{
  setProvider("openai-api");
  setCustomApiConfig({
    baseUrl: "https://api.example.com",
    apiKey: "sk-example",
    model: "example-model",
  });
  assert.equal(getProvider(), "openai-api");
  assert.equal(getCurrentModel("openai-api"), "example-model");
}

console.log("custom-api-provider tests passed");
