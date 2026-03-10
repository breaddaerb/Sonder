import { config } from "../../package.json";

export type ProviderID = "openai-api" | "openai-codex";

export const CODEX_MODELS = [
  "gpt-5.1",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
] as const;

export type CodexModel = typeof CODEX_MODELS[number];

export function getProvider(): ProviderID {
  const provider = Zotero.Prefs.get(`${config.addonRef}.provider`) as string;
  if (provider === "openai-codex") {
    return provider;
  }
  return "openai-api";
}

export function setProvider(provider: ProviderID) {
  Zotero.Prefs.set(`${config.addonRef}.provider`, provider);
}

export function supportsEmbeddings(provider: ProviderID = getProvider()) {
  return provider === "openai-api";
}

export function getCurrentModel(provider: ProviderID = getProvider()) {
  if (provider === "openai-codex") {
    return (Zotero.Prefs.get(`${config.addonRef}.codexModel`) as string) || "gpt-5.2";
  }
  return Zotero.Prefs.get(`${config.addonRef}.model`) as string;
}

export function setCurrentModel(model: string, provider: ProviderID = getProvider()) {
  if (provider === "openai-codex") {
    Zotero.Prefs.set(`${config.addonRef}.codexModel`, model);
  } else {
    Zotero.Prefs.set(`${config.addonRef}.model`, model);
  }
}

export function getCodexCredentials() {
  return {
    access: (Zotero.Prefs.get(`${config.addonRef}.oauthAccessToken`) as string) || "",
    refresh: (Zotero.Prefs.get(`${config.addonRef}.oauthRefreshToken`) as string) || "",
    expires: Number(Zotero.Prefs.get(`${config.addonRef}.oauthExpiresAt`) || 0),
    accountId: (Zotero.Prefs.get(`${config.addonRef}.oauthAccountId`) as string) || "",
  };
}

export function setCodexCredentials(credentials: {
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
}) {
  Zotero.Prefs.set(`${config.addonRef}.oauthAccessToken`, credentials.access || "");
  Zotero.Prefs.set(`${config.addonRef}.oauthRefreshToken`, credentials.refresh || "");
  Zotero.Prefs.set(`${config.addonRef}.oauthExpiresAt`, Math.max(0, Math.floor(credentials.expires || 0)));
  Zotero.Prefs.set(`${config.addonRef}.oauthAccountId`, credentials.accountId || "");
}

export function clearCodexCredentials() {
  setCodexCredentials({ access: "", refresh: "", expires: 0, accountId: "" });
}

export function hasCodexCredentials() {
  const credentials = getCodexCredentials();
  return Boolean(credentials.refresh || credentials.access);
}
