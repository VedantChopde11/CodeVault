import assert from "node:assert/strict";
import fs from "node:fs";
const local = new Map();
const session = new Map();
function storageArea(values) {
  return {
    setAccessLevel: async () => {},
    get: async (key) => ({
      [key]: values.get(key),
    }),
    set: async (entries) => {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
    remove: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    },
    clear: async () => values.clear(),
  };
}
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: storageArea(local),
      session: storageArea(session),
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
    },
  },
});
const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
assert.equal(manifest.key, undefined);
const extensionId = "mdceoheaomlhiijololigpfbpiplicda";
Object.assign(process.env, {
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret",
  GITHUB_CALLBACK_URL: "https://code-vault-tan.vercel.app/api/oauth/github/callback",
  KV_REST_API_URL: "https://redis.test",
  KV_REST_API_TOKEN: "test-redis-token",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  EXTENSION_ORIGIN: `chrome-extension://${extensionId}`,
  EXTENSION_REDIRECT_URL: `https://${extensionId}.chromiumapp.org/github`,
});
const { getOAuthConfig } = await import("../server/oauth/config.js");
const config = getOAuthConfig();
assert.equal(extensionId, "mdceoheaomlhiijololigpfbpiplicda");
assert.equal(config.extensionOrigin, `chrome-extension://${extensionId}`);
assert.equal(config.extensionRedirectUrl, `https://${extensionId}.chromiumapp.org/github`);
let nextResponse = new Response(null, {
  status: 500,
});
let authorization = "";
let requestedUrl = "";
let requestedMethod = "";
let responseQueue = [];
globalThis.fetch = async (input, init) => {
  requestedUrl = String(input);
  requestedMethod = String(init?.method || "GET");
  authorization = String(new Headers(init?.headers).get("authorization") || "");
  return responseQueue.shift() || nextResponse;
};
const github = await import("../extension/github.js");
const oauth = await import("../extension/oauth.js");
const store = await import("../extension/storage.js");
function hasGithubError(error, code, status) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "status" in error &&
    error.code === code &&
    error.status === status
  );
}
nextResponse = new Response(null, {
  status: 401,
});
await assert.rejects(github.verifyToken("valid-looking-token"), (error) =>
  hasGithubError(error, "github-auth", 401),
);
assert.equal(authorization, "Bearer valid-looking-token");
nextResponse = new Response(null, {
  status: 403,
});
await assert.rejects(github.verifyToken("permission-token"), (error) =>
  hasGithubError(error, "github-permission", 403),
);
responseQueue = [
  new Response(null, {
    status: 503,
  }),
  new Response(null, {
    status: 503,
  }),
  Response.json(
    {
      login: "TushalLohar",
    },
    {
      headers: {
        "x-oauth-scopes": "public_repo",
      },
    },
  ),
];
assert.deepEqual(await github.verifyToken("retry-token"), {
  login: "TushalLohar",
});
responseQueue = [
  new Response(null, {
    status: 503,
  }),
  new Response(null, {
    status: 503,
  }),
  new Response(null, {
    status: 503,
  }),
];
await assert.rejects(github.verifyToken("busy-token"), (error) =>
  hasGithubError(error, "transient", 503),
);
nextResponse = Response.json(
  {
    login: "TushalLohar",
  },
  {
    headers: {
      "x-oauth-scopes": "public_repo",
    },
  },
);
assert.deepEqual(await github.verifyToken("active-token"), {
  login: "TushalLohar",
});
nextResponse = Response.json(
  {
    login: "TushalLohar",
  },
  {
    headers: {
      "x-oauth-scopes": "repo",
    },
  },
);
await assert.rejects(github.verifyToken("broad-token"), /GitHub granted private-repository access/);
nextResponse = new Response(null, {
  status: 204,
});
assert.deepEqual(await github.starRepository("active-token", "TushalLohar", "CodeVault"), {
  starred: true,
});
assert.equal(requestedUrl, "https://api.github.com/user/starred/TushalLohar/CodeVault");
assert.equal(requestedMethod, "PUT");
assert.equal(authorization, "Bearer active-token");
await store.setConfig({
  token: "active-token",
  owner: "TushalLohar",
  setupComplete: true,
});
const originalNow = Date.now;
Date.now = () => originalNow() + 2 * 365 * 24 * 60 * 60 * 1000;
assert.equal((await store.getConfig()).token, "active-token");
Date.now = originalNow;
await store.setConfig({
  token: "active-token",
  owner: "TushalLohar",
  repo: "CP-Solutions",
  setupComplete: true,
});
await store.set(store.KEYS.projectRepoStarred, true);
await oauth.disconnect();
assert.equal((await store.getConfig()).token, "");
assert.equal((await store.getConfig()).owner, "TushalLohar");
assert.equal((await store.getConfig()).repo, "CP-Solutions");
assert.equal(await store.get(store.KEYS.projectRepoStarred, null), false);
process.stdout.write("GitHub auth reliability test: ok\n");
