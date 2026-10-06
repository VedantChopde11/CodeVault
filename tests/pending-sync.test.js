import assert from "node:assert/strict";
const values = {};
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
const pending = await import("../extension/pending.js");
const now = Date.now();
await pending.upsert({
  id: "watch:leetcode:4",
  platform: "leetcode",
  phase: "watch",
  tabId: 4,
  createdAt: now,
  expiresAt: now + 60_000,
  data: {
    slug: "two-sum",
  },
});
await pending.upsert({
  id: "watch:leetcode:4",
  platform: "leetcode",
  phase: "watch",
  tabId: 4,
  createdAt: now,
  expiresAt: now + 60_000,
  data: {
    slug: "three-sum",
  },
});
let jobs = await pending.list();
assert.equal(jobs.length, 1);
assert.equal(jobs[0]?.data.slug, "three-sum");
const restarted = await import(`../extension/pending.js?restart=${now}`);
jobs = await restarted.list();
assert.equal(jobs.length, 1);
assert.equal(jobs[0]?.id, "watch:leetcode:4");
await restarted.upsert({
  id: "expired:cses:1",
  platform: "cses",
  phase: "watch",
  createdAt: now - 120_000,
  expiresAt: now - 1,
  data: {
    taskId: "1",
  },
});
jobs = await restarted.list();
assert.equal(
  jobs.some((job) => job.id === "expired:cses:1"),
  false,
);
await restarted.upsert({
  id: "ready:leetcode:99",
  platform: "leetcode",
  phase: "ready",
  createdAt: now + 1,
  expiresAt: now + 86_400_000,
  data: {
    submission: {
      id: "99",
      slug: "three-sum",
    },
  },
});
await restarted.removeMatching("leetcode", 4);
jobs = await restarted.list();
assert.equal(
  jobs.some((job) => job.id === "watch:leetcode:4"),
  false,
);
assert.equal(
  jobs.some((job) => job.id === "ready:leetcode:99"),
  true,
);
process.stdout.write("Pending submission persistence test: ok\n");
