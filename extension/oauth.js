import * as store from "./storage.js";
import * as gh from "./github.js";

const OAUTH_API_BASE = "https://code-vault-tan.vercel.app";
const REQUEST_TIMEOUT = 30000;

function randomBase64Url(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  data.forEach((value) => (binary += String.fromCharCode(value)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  new Uint8Array(digest).forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function exchangeCode(code, verifier) {
  const response = await fetch(`${OAUTH_API_BASE}/api/oauth/github/exchange`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("CodeVault OAuth returned an invalid response.");
  }
  if (!response.ok || !data?.token) {
    throw new Error(
      data?.error === "exchange_expired"
        ? "GitHub authorization expired. Please try again."
        : "GitHub authorization failed.",
    );
  }
  return data.token;
}

export async function connect() {
  const verifier = randomBase64Url();
  const challenge = await sha256Base64Url(verifier);
  const flowState = randomBase64Url();
  const redirectUri = chrome.identity.getRedirectURL("github");
  const expectedRedirect = new URL(redirectUri);
  const startUrl = new URL(`${OAUTH_API_BASE}/api/oauth/github/start`);
  startUrl.searchParams.set("challenge", challenge);
  startUrl.searchParams.set("client_state", flowState);

  const finalUrl = await chrome.identity.launchWebAuthFlow({
    url: startUrl.toString(),
    interactive: true,
  });
  const callback = new URL(finalUrl);
  if (
    callback.origin !== expectedRedirect.origin ||
    callback.pathname !== expectedRedirect.pathname
  ) {
    throw new Error("GitHub returned to an unexpected CodeVault callback.");
  }
  const error = callback.searchParams.get("error");
  if (error) throw new Error("GitHub authorization was cancelled or failed.");
  if (callback.searchParams.get("state") !== flowState) {
    throw new Error("GitHub returned an authorization flow that CodeVault did not start.");
  }
  const code = callback.searchParams.get("code") || "";
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(code)) {
    throw new Error("GitHub did not return a valid authorization result.");
  }

  const token = await exchangeCode(code, verifier);
  const verified = await gh.verifyToken(token);
  return { token, owner: verified.login };
}

// Forget the GitHub connection locally. The user can revoke the OAuth grant
// from GitHub settings; no token is sent to a CodeVault server during disconnect.
export async function disconnect() {
  const config = await store.getConfig();
  if (!config) return;
  await Promise.all([
    store.setConfig({
      ...config,
      token: "",
      setupComplete: false,
      githubAuthInvalid: false,
    }),
    store.set(store.KEYS.projectRepoStarred, false),
  ]);
}
