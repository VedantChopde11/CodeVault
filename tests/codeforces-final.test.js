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
const { isFinalAcceptedSubmission, isPendingSubmission } = await import("../extension/cf.js");
assert.equal(
  isFinalAcceptedSubmission({
    verdict: "OK",
    testset: "PRETESTS",
    author: {
      participantType: "CONTESTANT",
    },
  }),
  false,
);
assert.equal(
  isFinalAcceptedSubmission({
    verdict: "OK",
    testset: "TESTS",
    author: {
      participantType: "CONTESTANT",
    },
  }),
  true,
);
assert.equal(
  isFinalAcceptedSubmission({
    verdict: "OK",
    testset: "TESTS",
    author: {
      participantType: "PRACTICE",
    },
  }),
  true,
);
assert.equal(
  isFinalAcceptedSubmission({
    verdict: "WRONG_ANSWER",
    testset: "TESTS",
    author: {
      participantType: "CONTESTANT",
    },
  }),
  false,
);
assert.equal(
  isPendingSubmission({
    verdict: "TESTING",
  }),
  true,
);
assert.equal(
  isPendingSubmission({
    verdict: "OK",
    testset: "PRETESTS",
    author: {
      participantType: "CONTESTANT",
    },
  }),
  true,
);
assert.equal(
  isPendingSubmission({
    verdict: "OK",
    testset: "TESTS",
    author: {
      participantType: "CONTESTANT",
    },
  }),
  false,
);
assert.equal(
  isPendingSubmission({
    verdict: "WRONG_ANSWER",
  }),
  false,
);
process.stdout.write("Codeforces final-verdict test: ok\n");
