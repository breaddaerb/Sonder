import assert from "node:assert/strict";
import { parseAuthorizationInput } from "../src/modules/Meet/CodexOAuth";

// --- parseAuthorizationInput tests ---

// Full redirect URL
{
  const result = parseAuthorizationInput("http://localhost:1455/auth/callback?code=abc123&state=xyz");
  assert.equal(result.code, "abc123");
  assert.equal(result.state, "xyz");
}

// Just the code
{
  const result = parseAuthorizationInput("abc123");
  assert.equal(result.code, "abc123");
  assert.equal(result.state, undefined);
}

// Code with hash separator
{
  const result = parseAuthorizationInput("abc123#statevalue");
  assert.equal(result.code, "abc123");
  assert.equal(result.state, "statevalue");
}

// URL with code= query string format
{
  const result = parseAuthorizationInput("code=mycode&state=mystate");
  assert.equal(result.code, "mycode");
  assert.equal(result.state, "mystate");
}

// Empty input
{
  const result = parseAuthorizationInput("");
  assert.equal(result.code, undefined);
  assert.equal(result.state, undefined);
}

// Whitespace input
{
  const result = parseAuthorizationInput("   ");
  assert.equal(result.code, undefined);
  assert.equal(result.state, undefined);
}

// URL without code param
{
  const result = parseAuthorizationInput("http://localhost:1455/auth/callback?error=access_denied");
  assert.equal(result.code, undefined);
}

// Note: getCodexAccountId uses window.atob internally (browser-only),
// so it cannot be tested in a Node environment without shimming globals.

console.log("codex oauth parsing tests passed");
