// GeeksforGeeks live detection — WITNESS MODEL.
//
// A solve is reported ONLY when the user clicks the "Submit" button on a
// practice problem AND the page then shows an accepted verdict. The submit
// click stashes a "pending" record; scan() returns immediately without one, so
// visiting an already-solved problem page never re-commits it. It fails CLOSED.
//
// Source code is captured into the short-lived witness at the trusted submit
// click, before the user can edit the buffer or navigate to another problem.

(function () {
  "use strict";

  if (window.__codevaultGFGContentInstalled) return;
  window.__codevaultGFGContentInstalled = true;

  const PENDING_TTL = 150_000;
  const reported = new Set();
  const reporting = new Set();
  let pending = null;
  let pendingLoaded = false;
  let scanning = false;

  function extractSlug() {
    const path = window.location.pathname;
    let m = path.match(/\/(?:problems|problem)\/([A-Za-z0-9_-]+)/i);
    if (m) return m[1];
    m = path.match(/\/practice\/problems\/([A-Za-z0-9_-]+)/i);
    if (m) return m[1];
    m = path.match(/\/batch\/[^/]+\/track\/[^/]+\/problem\/([A-Za-z0-9_-]+)/i);
    if (m) return m[1];
    return "";
  }

  function extractTitle() {
    const heading = document.querySelector(
      ".problem-title, .problem_title, [class*='problemName'], [class*='ProblemHeading'] h3, [class*='ProblemHeading'] h1, [class*='problem_heading'], h1, h2, h3",
    );
    if (heading && heading.textContent.trim()) {
      const cleaned = heading.textContent.replace(/^(Problem|Practice)\s*[:|-]\s*/i, "").trim();
      if (cleaned && cleaned.length < 80) return cleaned;
    }
    const title = document.title || "";
    return (
      title
        .split("|")[0]
        .split("-")[0]
        .replace(/Practice|GeeksforGeeks/gi, "")
        .trim() ||
      extractSlug() ||
      "Problem"
    );
  }

  function extractDifficulty() {
    for (const el of document.querySelectorAll(
      "[class*='ifficulty'], [class*='problemStatus'], [class*='difficulty'], .badge",
    )) {
      const text = el.textContent.trim().toLowerCase();
      for (const level of ["school", "basic", "easy", "medium", "hard"]) {
        if (text.includes(level)) return level[0].toUpperCase() + level.slice(1);
      }
    }
    const bodyText = document.body ? document.body.innerText : "";
    const labelled = bodyText.match(/Difficulty\s*[:-]?\s*(School|Basic|Easy|Medium|Hard)/i);
    if (labelled) return labelled[1][0].toUpperCase() + labelled[1].slice(1).toLowerCase();
    return "Easy";
  }

  function extractLanguage() {
    const picker = document.querySelector(
      "[class*='language'], [class*='Language'], .selected-language, select[name*='lang'], [data-cy='language-dropdown']",
    );
    const text = ((picker && (picker.value || picker.textContent)) || "").trim().toLowerCase();
    if (!text) return "C++";
    if (text.includes("python") || text.includes("pypy")) return "Python3";
    if (text.includes("javascript") || text.includes("node")) return "JavaScript";
    if (text.includes("typescript")) return "TypeScript";
    if (text.includes("java")) return "Java";
    if (text.includes("c++") || text.includes("cpp")) return "C++";
    if (text.includes("c#") || text.includes("csharp")) return "C#";
    if (text.includes("golang") || text.includes("go")) return "Go";
    if (text.includes("rust")) return "Rust";
    if (text.includes("kotlin")) return "Kotlin";
    if (/\bc\b/.test(text)) return "C";
    return "C++";
  }

  function setPending(event) {
    if (!event?.isTrusted) return;
    const slug = extractSlug();
    if (!slug) return;
    pending = {
      slug,
      title: extractTitle(),
      difficulty: extractDifficulty(),
      language: extractLanguage(),
      url: location.href,
      time: Date.now(),
    };
    pendingLoaded = true;
    chrome.runtime
      .sendMessage({ type: "gfg-witness", action: "set", data: pending })
      .then((response) => {
        if (response?.witness) pending = response.witness;
      })
      .catch(() => {});
  }

  async function getPending() {
    if (pending && Date.now() - Number(pending.time || 0) <= PENDING_TTL) return pending;
    pending = null;
    if (pendingLoaded) return null;
    pendingLoaded = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "gfg-witness", action: "get" });
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
    chrome.runtime.sendMessage({ type: "gfg-witness", action: "clear" }).catch(() => {});
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("button, [role='button'], input[type='submit']");
      const label = [
        control?.getAttribute("data-cy"),
        control?.getAttribute("data-testid"),
        control?.getAttribute("aria-label"),
        control instanceof HTMLInputElement ? control.value : control?.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (
        label === "submit" ||
        label.includes("submit code") ||
        label.includes("submit solution") ||
        label.includes("run & submit") ||
        label.includes("run and submit")
      ) {
        setPending(event);
      }
    },
    true,
  );

  function isAcceptedVerdict() {
    const text = document.body ? document.body.innerText : "";
    if (
      /Problem Solved Successfully/i.test(text) ||
      /Correct Answer/i.test(text) ||
      /All test cases passed/i.test(text) ||
      /All \d+ test cases passed/i.test(text)
    ) {
      return true;
    }
    const cases = text.match(/Test Cases Passed:\s*(\d+)\s*\/\s*(\d+)/i);
    if (cases && cases[1] === cases[2] && Number(cases[2]) > 0) return true;
    return false;
  }

  async function sendSolve() {
    const current = await getPending();
    if (!current) return;
    if (!isAcceptedVerdict()) return;

    const key = current.slug || current.title;
    if (reported.has(key) || reporting.has(key)) return;
    reporting.add(key);

    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: "gfg-accepted",
            slug: current.slug,
            title: current.title,
            difficulty: current.difficulty,
            language: current.language,
            url: current.url,
            source: current.source,
          });
          if (response?.ok) {
            reported.add(key);
            clearPending();
            return;
          }
          if (response?.retry === false) {
            clearPending();
            return;
          }
        } catch {
          // worker waking — retry
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } finally {
      reporting.delete(key);
    }
  }

  // Only re-check while a pending submit exists. Once it resolves or expires,
  // scanning stops — no idle polling of already-solved pages.
  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      await sendSolve();
    } finally {
      scanning = false;
    }
  }

  scan();
  const observer = new MutationObserver(() => scan());
  if (document.body || document.documentElement) {
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  setInterval(scan, 2500);
})();
