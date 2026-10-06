import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const manifest = JSON.parse(read("extension/manifest.json"));
assert.equal(manifest.version, "1.0.0");
assert.equal(manifest.minimum_chrome_version, "112");
assert.equal(Object.hasOwn(manifest, "key"), false);
const mainWorldScripts = manifest.content_scripts.filter((script) => script.world === "MAIN");
assert.ok(mainWorldScripts.length > 0);
for (const script of mainWorldScripts) {
  assert.doesNotMatch(
    script.matches.join("\n"),
    /^https:\/\/(?:leetcode|(?:\*\.)?codechef)\.com\/\*$/m,
  );
}
const extensionSource = fs
  .readdirSync("extension")
  .filter((name) => name.endsWith(".js"))
  .map((name) => read(`extension/${name}`))
  .join("\n");
assert.doesNotMatch(extensionSource, /chrome\.cookies\.getAll\s*\(/);
const background = read("extension/background.js");
assert.doesNotMatch(background, /ok:\s*false,\s*queued:\s*true/);
assert.match(background, /repoVisibilityConfirmed/);
assert.match(background, /setupFlow/);
assert.match(background, /GitHub setup is already in progress/);
assert.match(background, /result\.code === "unavailable"/);
assert.match(background, /if \(incomingId\)/);
const syncEngine = read("extension/sync.js");
assert.match(syncEngine, /summaryChain/);
assert.match(syncEngine, /crypto\.randomUUID\(\)/);
const leetcodeContent = read("extension/content-leetcode.js");
assert.match(leetcodeContent, /type: "lc-witness"/);
assert.match(read("extension/leetcode-main.js"), /__SOLVEBASE_LC_SUBMITTED__/);
const codechefContent = read("extension/content-codechef.js");
assert.match(codechefContent, /type: "codechef-witness"/);
assert.match(read("extension/codechef-main.js"), /__SOLVEBASE_CC_SUBMITTED__/);
assert.match(read("extension/gfg.js"), /export async function findSolved/);
assert.match(background, /gfg\.findSolved/);
assert.match(background, /retry: false, error: "Invalid LeetCode submission id\."/);
assert.match(read("extension/cf.js"), /isFinalAcceptedSubmission/);
const popup = read("extension/popup.html");
assert.match(popup, /id="repoPublicConsent"/);
assert.match(popup, /public GitHub repository/);
assert.doesNotMatch(popup, /id="platformCF" type="checkbox" checked/);
assert.match(popup, /id="platformLC" type="checkbox" checked/);
assert.match(popup, /id="platformCSES" type="checkbox" checked/);
assert.doesNotMatch(popup, /id="platformCodeChef" type="checkbox" checked/);
assert.doesNotMatch(popup, /id="platformGFG" type="checkbox" checked/);
const oauthClient = read("extension/oauth.js");
assert.match(oauthClient, /client_state/);
assert.match(oauthClient, /authorization flow that CodeVault did not start/);
assert.match(read("extension/popup.js"), /GitHub authorization is in progress/);
const oauthStart = read("api/oauth/github/start.js");
assert.match(oauthStart, /searchParams\.set\("scope", "public_repo"\)/);
assert.doesNotMatch(oauthStart, /searchParams\.set\("scope", "repo"\)/);
process.stdout.write("Release regression test: ok\n");
