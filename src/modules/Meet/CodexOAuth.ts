import meetState from "./state";
import { clearCodexCredentials, getCodexCredentials, setCodexCredentials } from "../provider";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(length: number = 32) {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256(value: string) {
  const buffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(buffer);
}

function decodeJwt(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return undefined;
    }
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
    return JSON.parse(window.atob(padded));
  } catch {
    return undefined;
  }
}

export function getCodexAccountId(accessToken: string) {
  const payload = decodeJwt(accessToken) as any;
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : "";
}

export async function startCodexOAuthLogin(originator: string = "sonder") {
  const verifier = randomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  const state = randomString(16);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", originator);
  meetState.codexOAuth = { state, verifier };
  return {
    url: url.toString(),
    state,
    verifier,
    redirectURI: REDIRECT_URI,
  };
}

export function parseAuthorizationInput(input: string) {
  const value = input.trim();
  if (!value) {
    return {} as { code?: string; state?: string };
  }
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") || undefined,
      state: url.searchParams.get("state") || undefined,
    };
  } catch { }
  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code, state };
  }
  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    return {
      code: params.get("code") || undefined,
      state: params.get("state") || undefined,
    };
  }
  return { code: value };
}

async function exchangeToken(body: URLSearchParams) {
  const res = await Zotero.HTTP.request(
    "POST",
    TOKEN_URL,
    {
      responseType: "json",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );
  const json = res.response as any;
  if (!json?.access_token || !json?.refresh_token || typeof json?.expires_in !== "number") {
    throw new Error("Invalid token response from OpenAI OAuth.");
  }
  const accountId = getCodexAccountId(json.access_token);
  if (!accountId) {
    throw new Error("Failed to extract ChatGPT account id from OAuth token.");
  }
  const credentials = {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
  };
  setCodexCredentials(credentials);
  return credentials;
}

export async function finishCodexOAuthLogin(input: string) {
  const pending = meetState.codexOAuth as { state: string; verifier: string } | undefined;
  if (!pending?.state || !pending?.verifier) {
    throw new Error("No OAuth login is in progress. Run /login first.");
  }
  const parsed = parseAuthorizationInput(input);
  if (!parsed.code) {
    throw new Error("Missing authorization code. Paste the full redirect URL or the code.");
  }
  if (parsed.state && parsed.state !== pending.state) {
    throw new Error("OAuth state mismatch. Please run /login again.");
  }
  const credentials = await exchangeToken(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code: parsed.code,
    code_verifier: pending.verifier,
    redirect_uri: REDIRECT_URI,
  }));
  meetState.codexOAuth = undefined;
  return credentials;
}

export async function refreshCodexAccessToken() {
  const credentials = getCodexCredentials();
  if (!credentials.refresh) {
    throw new Error("No Codex refresh token found. Run /login first.");
  }
  const refreshed = await exchangeToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refresh,
    client_id: CLIENT_ID,
  }));
  return refreshed;
}

export async function getValidCodexAccessToken() {
  let credentials = getCodexCredentials();
  if (!credentials.refresh && !credentials.access) {
    throw new Error("No Codex credentials found. Run /provider openai-codex then /login.");
  }
  if (credentials.expires && Date.now() < credentials.expires - 60 * 1000 && credentials.access && credentials.accountId) {
    return credentials;
  }
  credentials = await refreshCodexAccessToken();
  return credentials;
}

export function clearCodexLogin() {
  meetState.codexOAuth = undefined;
  clearCodexCredentials();
}

export function getCodexLoginReport() {
  const credentials = getCodexCredentials();
  return {
    ...credentials,
    hasPendingLogin: Boolean(meetState.codexOAuth?.state),
  };
}
