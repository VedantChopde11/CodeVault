import assert from "node:assert/strict";
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
        setAccessLevel: async () => {},
      },
      session: {
        setAccessLevel: async () => {},
      },
    },
  },
});
const submittedAt = Date.parse("2026-08-18T10:00:00+05:30");
let responseTime = "2026-08-18 10:01:00";
globalThis.fetch = async () =>
  Response.json({
    status: "success",
    result: {
      Medium: {
        12345: {
          slug: "two-sum",
          pname: "Two Sum",
          lang: "cpp",
          user_subtime: responseTime,
        },
      },
    },
    count: 1,
  });
const { findSolved } = await import("../extension/gfg.js");
const fresh = await findSolved("tourist", "two-sum", submittedAt);
assert.equal(fresh?.id, "12345");
assert.equal(fresh?.difficulty, "Medium");
assert.equal(fresh?.language, "cpp");
responseTime = "2026-08-17 10:01:00";
const stale = await findSolved("tourist", "two-sum", submittedAt);
assert.equal(stale, null);
const otherProblem = await findSolved("tourist", "three-sum", submittedAt);
assert.equal(otherProblem, null);
process.stdout.write("GeeksforGeeks background verdict test: ok\n");
