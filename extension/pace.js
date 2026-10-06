// Minimal request pacer.
//
// Live sync makes a handful of requests per solve, so there is nothing to
// throttle adaptively any more. All this does is serialize a platform's
// requests and keep a small gap *between* consecutive calls — the first call
// after an idle moment runs immediately, which is what makes a fresh solve
// commit within seconds.

const jitter = (min, max) => min + Math.random() * (max - min);

export function createPacer(options = {}) {
  const min = Number(options.min) || 400;
  const max = Number(options.max) || Math.max(min, 8000);
  let gap = min;
  let last = 0;
  let chain = Promise.resolve();

  function noteOutcome(ok) {
    // A throttled reply widens the gap for the next call; a clean one relaxes it.
    gap = ok ? min : Math.min(max, Math.max(min, gap * 2));
  }

  return {
    noteOutcome,

    throttleBackoffMs(res) {
      const retryAfter = Number(res?.headers?.get?.("retry-after") || 0);
      if (retryAfter) return retryAfter * 1000;
      return Math.max(1000, gap);
    },

    paced(task) {
      const run = chain.then(async () => {
        const wait = last ? last + jitter(gap, gap * 1.2) - Date.now() : 0;
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          return await task();
        } finally {
          last = Date.now();
        }
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
