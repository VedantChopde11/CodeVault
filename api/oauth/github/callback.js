import { EXCHANGE_CODE_TTL, getOAuthConfig } from "../../../server/oauth/config.js";
import { encryptJson, randomToken, sha256 } from "../../../server/oauth/crypto.js";
import { clientIp, redirect, requestUrl, sendJson } from "../../../server/oauth/http.js";
import { enforceRateLimit } from "../../../server/oauth/rate-limit.js";
import { getAndDelete, setValue } from "../../../server/oauth/redis.js";
function extensionError(config, response) {
  redirect(response, `${config.extensionRedirectUrl}?error=oauth_failed`);
}
export default async function handler(request, response) {
  let config;
  try {
    config = getOAuthConfig();
  } catch {
    sendJson(response, 500, {
      error: "oauth_unavailable",
    });
    return;
  }
  if (request.method !== "GET") {
    extensionError(config, response);
    return;
  }
  try {
    await enforceRateLimit("callback", clientIp(request), 120, 600, {
      burstLimit: 15,
      burstWindowSeconds: 5,
      globalLimit: 600,
      globalWindowSeconds: 60,
    });
    const params = requestUrl(request).searchParams;
    const state = params.get("state") || "";
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(state)) {
      extensionError(config, response);
      return;
    }
    const stateValue = await getAndDelete(`codevault:oauth:state:${sha256(state)}`);
    if (!stateValue) {
      extensionError(config, response);
      return;
    }
    const stateData = JSON.parse(stateValue);
    if (
      !stateData.challenge ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(stateData.challenge) ||
      !stateData.clientState ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(stateData.clientState)
    ) {
      extensionError(config, response);
      return;
    }
    if (params.get("error")) {
      redirect(
        response,
        `${config.extensionRedirectUrl}?error=oauth_denied&state=${encodeURIComponent(stateData.clientState)}`,
      );
      return;
    }
    const code = params.get("code") || "";
    if (!/^[A-Za-z0-9_-]{10,256}$/.test(code)) {
      extensionError(config, response);
      return;
    }
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        redirect_uri: config.githubCallbackUrl,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;
    if (
      !tokenResponse.ok ||
      typeof token !== "string" ||
      token.length < 20 ||
      token.length > 512 ||
      /\s/.test(token)
    ) {
      extensionError(config, response);
      return;
    }
    const exchangeCode = randomToken();
    const payload = encryptJson(
      {
        token,
        challenge: stateData.challenge,
      },
      config.tokenEncryptionKey,
    );
    const stored = await setValue(
      `codevault:oauth:exchange:${sha256(exchangeCode)}`,
      payload,
      EXCHANGE_CODE_TTL,
    );
    if (!stored) {
      extensionError(config, response);
      return;
    }
    redirect(
      response,
      `${config.extensionRedirectUrl}?code=${encodeURIComponent(exchangeCode)}&state=${encodeURIComponent(stateData.clientState)}`,
    );
  } catch {
    extensionError(config, response);
  }
}
