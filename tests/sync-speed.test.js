import assert from "node:assert/strict";
const values = {
  config: {
    token: "token",
    owner: "octocat",
    repo: "solutions",
    handle: "tourist",
    setupComplete: true,
    platforms: {
      gfg: true,
    },
  },
  synced: {},
  processed: {},
};
const local = {
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
      local,
      session: {
        setAccessLevel: async () => {},
      },
    },
  },
});
let releaseReadme;
let readmeStarted;
const readmeStart = new Promise((resolve) => {
  readmeStarted = resolve;
});
const readmeGate = new Promise((resolve) => {
  releaseReadme = resolve;
});
const requests = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const method = String(init?.method || "GET");
  requests.push({
    method,
    url,
  });
  if (url.endsWith("/contents/README.md") && method === "GET") {
    readmeStarted();
    await readmeGate;
    return new Response("", {
      status: 404,
    });
  }
  if (method === "GET") {
    return Response.json({
      sha: "existing-sha",
      content: btoa("old source"),
    });
  }
  return Response.json({
    content: {
      sha: "sha",
    },
  });
};
const sync = await import("../extension/sync.js");
const first = await sync.processLive("gfg", {
  id: "arrays:one",
  slug: "arrays",
  title: "Arrays",
  difficulty: "Easy",
  language: "C++",
  source: "int main() { return 0; }",
});
assert.ok(first);
assert.equal(first.outcome, "created");
assert.equal(requests.filter((request) => request.url.endsWith("README.md")).length, 0);
assert.equal(typeof values["readmeDirty"]?.id, "string");
const firstSummary = sync.flushRepositorySummary();
await readmeStart;
const secondCommit = sync.processLive("gfg", {
  id: "strings:two",
  slug: "strings",
  title: "Strings",
  difficulty: "Easy",
  language: "C++",
  source: "int main() { return 1; }",
});
const second = await Promise.race([
  secondCommit,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Solution commit waited for README refresh")), 500),
  ),
]);
assert.ok(second);
assert.equal(second.outcome, "created");
releaseReadme();
await firstSummary;
assert.ok(values["readmeDirty"], "A solve during README refresh must keep the summary dirty");
await sync.flushRepositorySummary();
assert.equal(values["readmeDirty"], undefined);
values["synced"] = {
  "gfg:Some Problem": {
    platform: "gfg",
    folder: "Legacy",
    title: "Some Problem",
    path: "geeksforgeeks/Legacy/Some Problem.cpp",
    imported: true,
  },
};
const importedUpdate = await sync.processLive("gfg", {
  id: "some-problem:three",
  slug: "some-problem-slug",
  title: "Some Problem",
  difficulty: "Easy",
  language: "C++",
  source: "int main() { return 2; }",
});
assert.ok(importedUpdate);
assert.equal(importedUpdate.outcome, "updated");
const adoptedIndex = values["synced"];
assert.equal(adoptedIndex["gfg:some-problem-slug"]?.path, "geeksforgeeks/Legacy/Some Problem.cpp");
assert.equal(adoptedIndex["gfg:Some Problem"], undefined);
assert.ok(
  requests.some((request) =>
    request.url.endsWith("/contents/geeksforgeeks/Legacy/Some%20Problem.cpp"),
  ),
);
const solutionPuts = requests.filter(
  (request) => request.method === "PUT" && !request.url.endsWith("README.md"),
);
assert.equal(solutionPuts.length, 3);
process.stdout.write("Fast solution commit test: ok\n");
