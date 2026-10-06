// Platform registry. Each adapter exposes the same shape so sync.js can treat
// Codeforces, LeetCode, CSES, CodeChef and GeeksforGeeks uniformly.

import { PLATFORM as codeforces } from "./cf.js";
import { PLATFORM as leetcode } from "./leetcode.js";
import { PLATFORM as cses } from "./cses.js";
import { PLATFORM as codechef } from "./codechef.js";
import { PLATFORM as gfg } from "./gfg.js";

const PLATFORMS = {
  codeforces,
  leetcode,
  cses,
  codechef,
  gfg,
};

export function getPlatform(name) {
  return PLATFORMS[name] || null;
}

// Session flag each platform reports under.
const SESSION_KEY = {
  codeforces: "cfOk",
  leetcode: "lcOk",
  cses: "csesOk",
  codechef: "codechefOk",
  gfg: "gfgOk",
};

export function sessionKeyFor(platformName) {
  return SESSION_KEY[platformName] || null;
}

export function enabledPlatforms(config) {
  const platforms = config?.platforms || {};
  return Object.keys(PLATFORMS).filter((p) => platforms[p] !== false);
}
