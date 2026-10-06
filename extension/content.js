// Codeforces live detection — WITNESS MODEL.
//
// A solve is reported ONLY if this script watched the user press Submit. The
// click stashes a "pending" record (problem + language + timestamp) in
// extension-only session storage; after Codeforces navigates to the verdict page we look
// for that problem's newest own row and report it once it turns Accepted.
// No pending record → nothing is ever reported. It fails CLOSED.

(function () {
  "use strict";

  if (window.__codevaultCodeforcesContentInstalled) return;
  window.__codevaultCodeforcesContentInstalled = true;

  const PENDING_TTL = 15 * 60 * 1000; // verdicts can queue for a few minutes
  const reported = new Set();
  const reporting = new Set();
  let pending = null;
  let pendingLoaded = false;
  let scanning = false;

  // ---- Problem context ----------------------------------------------------
  // Submits happen on /contest/<id>/submit, /gym/<id>/submit or
  // /problemset/submit — none of which carry the problem index in the URL, so
  // read it from the form. Problem pages are supported too (quick-submit box).
  function contestIdFromUrl() {
    const m = location.pathname.match(/\/(?:contest|gym)\/(\d+)/i);
    return m ? m[1] : null;
  }

  function contextFromUrl() {
    const p = location.pathname;
    let m = p.match(/\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
    if (m) return { contestId: m[1], problemIndex: m[2] };
    m = p.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
    if (m) return { contestId: m[1], problemIndex: m[2] };
    return {};
  }

  function contextFromForm() {
    const ctx = {};
    const indexSel = document.querySelector(
      "select[name='submittedProblemIndex'], input[name='submittedProblemIndex']",
    );
    if (indexSel && indexSel.value) {
      ctx.problemIndex = String(indexSel.value).trim();
      ctx.contestId = contestIdFromUrl();
    }
    // /problemset/submit uses a free-text "1520A" style code.
    const codeInput = document.querySelector(
      "input[name='submittedProblemCode'], select[name='submittedProblemCode']",
    );
    if (!ctx.problemIndex && codeInput && codeInput.value) {
      const m = String(codeInput.value)
        .trim()
        .match(/^(\d+)\s*([A-Za-z]\d*)$/);
      if (m) {
        ctx.contestId = m[1];
        ctx.problemIndex = m[2];
      }
    }
    return ctx;
  }

  function problemNameFromPage() {
    const el = document.querySelector(
      ".problem-statement .title, .problem-statement h1, #pageContent .title",
    );
    if (!el) return null;
    const t = el.textContent.trim();
    const m = t.match(/^[A-Za-z0-9]+\s*[-–.]\s*(.+)$/);
    return m ? m[1].trim() : t;
  }

  function languageFromPage() {
    const sel = document.querySelector(
      "select[name='programTypeId'], #programTypeId, .lang-chooser select",
    );
    if (sel && sel.options && sel.selectedIndex >= 0) {
      const text = sel.options[sel.selectedIndex]?.text?.trim();
      if (text) return text;
    }
    return null;
  }

  // Stash what we know at submit time. Source is NOT read here: Codeforces
  // copies the Ace buffer into the textarea after our capture-phase listener
  // runs, and window.ace is invisible from the isolated world. The source comes
  // from /data/submitSource once we know the submission id.
  function captureSubmit(event) {
    if (!event?.isTrusted) return;
    const ctx = { ...contextFromUrl(), ...contextFromForm() };
    const onSubmitPage = /\/submit/i.test(location.pathname);
    if (!ctx.problemIndex && !onSubmitPage) return;
    pending = {
      time: Date.now(),
      contestId: ctx.contestId || null,
      problemIndex: ctx.problemIndex || null,
      problemName: problemNameFromPage(),
      language: languageFromPage(),
    };
    pendingLoaded = true;
    chrome.runtime
      .sendMessage({ type: "cf-witness", action: "set", data: pending })
      .then((response) => {
        if (response?.witness) pending = response.witness;
      })
      .catch(() => {});
  }

  document.addEventListener("submit", captureSubmit, true);
  document.addEventListener(
    "click",
    (event) => {
      const el =
        event.target instanceof Element
          ? event.target.closest("input[type='submit'], button[type='submit'], .submit")
          : null;
      if (el) captureSubmit(event);
    },
    true,
  );

  async function getPending() {
    if (pending && Date.now() - Number(pending.time || 0) <= PENDING_TTL) return pending;
    pending = null;
    if (pendingLoaded) return null;
    pendingLoaded = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "cf-witness", action: "get" });
      if (!response?.ok) pendingLoaded = false;
      pending = response?.witness || null;
      return pending;
    } catch {
      pendingLoaded = false;
      return null;
    }
  }

  function clearPending() {
    pending = null;
    pendingLoaded = true;
    chrome.runtime.sendMessage({ type: "cf-witness", action: "clear" }).catch(() => {});
  }

  // ---- Ownership ----------------------------------------------------------
  function pageHandle() {
    const link =
      document.querySelector(".lang-chooser a[href^='/profile/']") ||
      document.querySelector("#header a[href^='/profile/']") ||
      document.querySelector(".personal-sidebar a[href^='/profile/']");
    const href = link?.getAttribute("href") || "";
    const m = href.match(/\/profile\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]).toLowerCase() : null;
  }

  function isMine(container) {
    const handle = pageHandle();
    if (!handle) return true; // can't tell — the witness gate already fired
    const links = container.querySelectorAll("a[href*='/profile/']");
    if (!links.length) return true;
    for (const link of links) {
      const m = (link.getAttribute("href") || "").match(/\/profile\/([^/?#]+)/i);
      if (m && decodeURIComponent(m[1]).toLowerCase() === handle) return true;
    }
    return false;
  }

  // ---- Verdicts -----------------------------------------------------------
  const REJECTED =
    /Wrong answer|Time limit exceeded|Runtime error|Compilation error|Memory limit exceeded|Idleness limit|Hacked|Skipped|Judgement failed/i;
  const WAITING = /In queue|Running|Testing|Pending|Compiling/i;

  function verdictOf(scope) {
    if (scope.querySelector(".verdict-accepted, [class*='verdict-accepted']")) return "accepted";
    const text = scope.innerText || "";
    if (WAITING.test(text)) return "waiting";
    if (REJECTED.test(text)) return "rejected";
    if (/\bAccepted\b/.test(text)) return "accepted";
    return "waiting";
  }

  function detailSubmissionId() {
    const p = location.pathname;
    const m =
      p.match(/\/(?:contest|gym)\/\d+\/submission\/(\d+)/i) || p.match(/\/submission\/(\d+)/i);
    return m ? m[1] : null;
  }

  function pageSource() {
    const block = document.querySelector(
      "#program-source-text, .program-source-text, textarea#program-source-text",
    );
    if (!block) return null;
    const text = block.value || block.innerText;
    return text && text.trim() ? text.trim() : null;
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="X-Csrf-Token"]');
    return (
      (meta && meta.content) || document.querySelector('input[name="csrf_token"]')?.value || ""
    );
  }

  async function fetchSourceFromApi(submissionId) {
    try {
      const csrf = getCsrfToken();
      if (!csrf || !submissionId) return null;
      const res = await fetch("/data/submitSource", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Csrf-Token": csrf,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams({ submissionId: String(submissionId), csrf_token: csrf }),
      });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      if (json && json.source) return json.source;
    } catch {
      // network/CSRF hiccup — the background worker can still fetch the source
    }
    return null;
  }

  function rowProblem(row) {
    const probLink = row.querySelector("a[href*='/problem/']");
    const href = probLink?.getAttribute("href") || "";
    let m = href.match(/\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
    if (m) return { contestId: m[1], problemIndex: m[2] };
    m = href.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
    if (m) return { contestId: m[1], problemIndex: m[2] };
    return null;
  }

  async function report(info) {
    const id = String(info.id || "");
    if (!id || reported.has(id) || reporting.has(id)) return;
    reporting.add(id);
    reported.add(id);

    const source = (await fetchSourceFromApi(id)) || pageSource() || null;

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: "cf-accepted",
            submissionId: id,
            contestId: info.contestId || undefined,
            problemIndex: info.problemIndex || undefined,
            problemName: info.problemName || undefined,
            language: info.language || undefined,
            source,
          });
          if (response?.ok) {
            clearPending();
            return;
          }
          if (response?.retry === false) {
            clearPending();
            return;
          }
        } catch {
          // service worker waking — retry
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      reported.delete(id); // let a later scan try again
    } finally {
      reporting.delete(id);
    }
  }

  // The ONLY entry point. Returns immediately when there is no pending submit,
  // so a cold visit to any submissions/status/profile page does nothing.
  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      const current = await getPending();
      if (!current) return;

      // 1. Submission detail page.
      const detailId = detailSubmissionId();
      if (detailId) {
        const scope = document.querySelector("#pageContent") || document.body;
        if (isMine(scope) && verdictOf(scope) === "accepted") {
          report({ id: detailId, ...current });
        }
        return;
      }

      // 2. Status/"my submissions" table. Rows are newest-first, so the first
      //    match for the problem we just submitted is that submission.
      const rows = document.querySelectorAll("tr[data-submission-id]");
      for (const row of rows) {
        if (!isMine(row)) continue;
        const prob = rowProblem(row);
        if (current.problemIndex) {
          if (!prob) continue;
          if (
            String(prob.problemIndex).toUpperCase() !== String(current.problemIndex).toUpperCase()
          ) {
            continue;
          }
          if (current.contestId && prob.contestId && prob.contestId !== String(current.contestId)) {
            continue;
          }
        }
        const verdict = verdictOf(row);
        if (verdict === "waiting") return;
        if (verdict === "rejected") {
          if (current.problemIndex) clearPending();
          return;
        }
        report({
          id: row.getAttribute("data-submission-id"),
          ...current,
          contestId: current.contestId || prob?.contestId || null,
          problemIndex: current.problemIndex || prob?.problemIndex || null,
        });
        return;
      }
    } finally {
      scanning = false;
    }
  }

  scan();
  const observer = new MutationObserver(() => scan());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  setInterval(scan, 2000);
})();
