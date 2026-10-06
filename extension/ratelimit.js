import * as store from "./storage.js";

const WRITE_PER_MINUTE = 60;
const WRITE_PER_HOUR = 400;
const READ_PER_MINUTE = 70;
const MIN_WRITE_GAP = 350;
const PRIMARY_FLOOR = 150;
const MAX_INLINE_WAIT = 5000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

let state = null;
let loading = null;
let flushTimer = null;

function blank() {
  return {
    writes: [],
    reads: [],
    lastWrite: 0,
    pausedUntil: 0,
    primaryRemaining: null,
    primaryReset: 0,
  };
}

async function load() {
  if (state) return state;
  if (!loading) {
    loading = store
      .get("githubBudget", null)
      .then((saved) => {
        state = {
          ...blank(),
          ...(saved && typeof saved === "object" ? saved : {}),
        };
        if (!Array.isArray(state.writes)) state.writes = [];
        if (!Array.isArray(state.reads)) state.reads = [];
        return state;
      })
      .catch(() => {
        state = blank();
        return state;
      });
  }
  return loading;
}

function flushSoon() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (state) store.set("githubBudget", state).catch(() => {});
  }, 500);
}

function prune(now) {
  state.writes = state.writes.filter((at) => now - at < HOUR);
  state.reads = state.reads.filter((at) => now - at < MINUTE);
}

function throttled(message, waitMs) {
  const err = new Error(message);
  err.code = "ratelimit";
  err.retryAfter = Math.max(1000, Math.round(waitMs));
  return err;
}

function windowWait(list, now, span, limit) {
  const inWindow = list.filter((at) => now - at < span).sort((a, b) => a - b);
  if (inWindow.length < limit) return 0;
  const oldest = inWindow[inWindow.length - limit];
  return Math.max(0, span - (now - oldest));
}

async function admit(kind) {
  await load();
  const now = Date.now();
  prune(now);

  const waits = [];

  if (state.pausedUntil > now) {
    waits.push({ ms: state.pausedUntil - now, why: "GitHub rate limit backoff" });
  }

  if (state.primaryRemaining !== null && state.primaryRemaining < PRIMARY_FLOOR) {
    const reset = state.primaryReset || now + MINUTE;
    if (reset > now) waits.push({ ms: reset - now, why: "GitHub hourly request budget low" });
  }

  if (kind === "write") {
    const gap = MIN_WRITE_GAP - (now - state.lastWrite);
    if (gap > 0) waits.push({ ms: gap, why: "pacing writes" });
    const perMinute = windowWait(state.writes, now, MINUTE, WRITE_PER_MINUTE);
    if (perMinute > 0) waits.push({ ms: perMinute, why: "GitHub write limit for this minute" });
    const perHour = windowWait(state.writes, now, HOUR, WRITE_PER_HOUR);
    if (perHour > 0) waits.push({ ms: perHour, why: "GitHub write limit for this hour" });
  } else {
    const perMinute = windowWait(state.reads, now, MINUTE, READ_PER_MINUTE);
    if (perMinute > 0) waits.push({ ms: perMinute, why: "GitHub read limit for this minute" });
  }

  const longest = waits.sort((a, b) => b.ms - a.ms)[0];
  if (longest) {
    if (longest.ms > MAX_INLINE_WAIT) {
      throw throttled(`Waiting on GitHub (${longest.why})`, longest.ms);
    }
    await new Promise((resolve) => setTimeout(resolve, longest.ms));
  }

  const at = Date.now();
  if (kind === "write") {
    state.writes.push(at);
    state.lastWrite = at;
  } else {
    state.reads.push(at);
  }
  flushSoon();
}

let chain = Promise.resolve();

export function reserve(kind) {
  const run = chain.then(() => admit(kind === "write" ? "write" : "read"));
  chain = run.catch(() => {});
  return run;
}

export async function note(res) {
  if (!res) return;
  await load();
  const remainingHeader = res.headers?.get?.("x-ratelimit-remaining");
  const remaining =
    remainingHeader == null || remainingHeader === "" ? NaN : Number(remainingHeader);
  if (Number.isFinite(remaining)) state.primaryRemaining = remaining;
  const resetHeader = res.headers?.get?.("x-ratelimit-reset");
  const reset = resetHeader == null || resetHeader === "" ? NaN : Number(resetHeader);
  if (Number.isFinite(reset) && reset > 0) state.primaryReset = reset * 1000;

  if (res.status === 403 || res.status === 429) {
    const retryAfter = Number(res.headers?.get?.("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      state.pausedUntil = Date.now() + retryAfter * 1000;
    } else if (remaining === 0 && state.primaryReset > Date.now()) {
      state.pausedUntil = state.primaryReset;
    } else if (res.status === 429) {
      state.pausedUntil = Date.now() + MINUTE;
    }
  }
  flushSoon();
}
