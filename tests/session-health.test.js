import assert from "node:assert/strict";
const values = {
  config: {
    gfgHandle: "tourist",
  },
};
let tabs = [];
let scriptResult = null;
let fetchResponse = async () =>
  new Response("", {
    status: 503,
  });
const storage = {
  async get(key) {
    return {
      [key]: values[key],
    };
  },
  async set(update) {
    Object.assign(values, update);
  },
  async remove(key) {
    delete values[key];
  },
  async setAccessLevel() {},
};
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: storage,
      session: storage,
    },
    tabs: {
      async query() {
        return tabs;
      },
    },
    scripting: {
      async executeScript() {
        return [
          {
            result: scriptResult,
          },
        ];
      },
    },
    cookies: {
      async get() {
        return null;
      },
    },
  },
});
globalThis.fetch = async () => fetchResponse();
const gfg = await import("../extension/gfg.js");
tabs = [];
assert.equal((await gfg.checkSession()).ok, null);
tabs = [
  {
    id: 1,
    status: "complete",
  },
];
scriptResult = {
  signedIn: true,
};
assert.equal((await gfg.checkSession()).ok, true);
const codechef = await import("../extension/codechef.js");
tabs = [];
fetchResponse = async () =>
  new Response("temporarily blocked", {
    status: 503,
  });
assert.equal((await codechef.checkSession()).ok, null);
fetchResponse = async () => new Response("<html>changed navigation</html>");
assert.equal((await codechef.checkSession()).ok, null);
fetchResponse = async () => new Response('<a href="/login">Log in</a>');
assert.equal((await codechef.checkSession()).ok, false);
fetchResponse = async () => new Response('<a href="/logout">Log out</a>');
assert.equal((await codechef.checkSession()).ok, true);
const codeforces = await import("../extension/cf.js");
fetchResponse = async () =>
  new Response("Just a moment", {
    status: 403,
  });
assert.equal((await codeforces.checkSession()).ok, null);
fetchResponse = async () => new Response("<html>changed navigation</html>");
assert.equal((await codeforces.checkSession()).ok, null);
fetchResponse = async () => new Response('<a href="/enter">Enter</a>');
assert.equal((await codeforces.checkSession()).ok, false);
fetchResponse = async () => new Response('<a href="/logout">Logout</a>');
assert.equal((await codeforces.checkSession()).ok, true);
const cses = await import("../extension/cses.js");
fetchResponse = async () => new Response("<html>changed navigation</html>");
assert.equal((await cses.checkSession()).ok, null);
fetchResponse = async () => new Response('<a href="/login">Login</a>');
assert.equal((await cses.checkSession()).ok, false);
fetchResponse = async () => new Response('<a href="/logout">Logout</a>');
assert.equal((await cses.checkSession()).ok, true);
fetchResponse = async () => {
  throw new TypeError("network offline");
};
assert.equal((await cses.checkSession()).ok, null);
const leetcode = await import("../extension/leetcode.js");
fetchResponse = async () => {
  throw new TypeError("network offline");
};
assert.equal((await leetcode.checkSession()).ok, null);
fetchResponse = async () =>
  Response.json({
    data: {
      userStatus: {
        isSignedIn: false,
        username: null,
      },
    },
  });
assert.equal((await leetcode.checkSession()).ok, false);
fetchResponse = async () =>
  Response.json({
    data: {
      userStatus: {
        isSignedIn: true,
        username: "tourist",
      },
    },
  });
const leetcodeSession = await leetcode.checkSession();
assert.equal(leetcodeSession.ok, true);
assert.equal(leetcodeSession.profileUrl, "https://leetcode.com/u/tourist/");
process.stdout.write("Platform session health test: ok\n");
