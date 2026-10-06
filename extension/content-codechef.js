(function () {
  "use strict";

  if (window.__codevaultCodeChefContentInstalled) return;
  window.__codevaultCodeChefContentInstalled = true;

  const SUBMIT_TTL_MS = 10 * 60 * 1000;
  const RETRY_DELAYS = [0, 2000, 4000, 8000, 16000, 30000, 60000, 120000];
  const reported = new Set();
  const reporting = new Set();
  let lastTrustedSubmitAt = 0;

  function controlLabel(target) {
    if (!(target instanceof Element)) return "";
    const control = target.closest("button, [role='button'], input[type='submit']");
    if (!control) return "";
    return [
      control.getAttribute("data-cy"),
      control.getAttribute("data-testid"),
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control instanceof HTMLInputElement ? control.value : control.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function isSubmitControl(target) {
    const label = controlLabel(target);
    return (
      label === "submit" ||
      label.includes("submit code") ||
      label.includes("submit solution") ||
      label.includes("run & submit") ||
      label.includes("run and submit")
    );
  }

  function recordSubmit() {
    lastTrustedSubmitAt = Date.now();
    chrome.runtime
      .sendMessage({
        type: "codechef-witness",
        action: "set",
        data: { problemCode: problemCodeFromPage() || undefined },
      })
      .catch(() => {});
  }

  document.addEventListener(
    "click",
    (event) => {
      if (event.isTrusted && isSubmitControl(event.target)) recordSubmit();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isTrusted && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        recordSubmit();
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      if (event.isTrusted) recordSubmit();
    },
    true,
  );

  function consumeRecentSubmit() {
    if (!lastTrustedSubmitAt || Date.now() - lastTrustedSubmitAt > SUBMIT_TTL_MS) return 0;
    const submittedAt = lastTrustedSubmitAt;
    lastTrustedSubmitAt = 0;
    return submittedAt;
  }

  function problemCodeFromPage() {
    const path = location.pathname;
    const pathMatch =
      path.match(/\/problems\/([A-Za-z0-9_]+)/i) || path.match(/\/submit\/([A-Za-z0-9_]+)/i);
    if (pathMatch) return pathMatch[1];

    const element = document.querySelector(
      "[data-cy='problem-code'], .problem-code, .breadcrumbs a[href*='/problems/']",
    );
    const text = element?.textContent?.trim() || "";
    return /^[A-Za-z0-9_]{1,64}$/.test(text) ? text : null;
  }

  async function report(id, problemCode, submittedAt) {
    if (reported.has(id) || reporting.has(id)) return;
    reporting.add(id);
    try {
      for (const delay of RETRY_DELAYS) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const response = await chrome.runtime.sendMessage({
            type: "codechef-accepted",
            submissionId: id,
            problemCode: problemCode || undefined,
            submittedAt,
          });
          if (response?.ok) {
            reported.add(id);
            return;
          }
          if (response?.retry === false) return;
        } catch {}
      }
    } finally {
      reporting.delete(id);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || typeof data.type !== "string") return;

    const id = String(data.submissionId || "");
    if (!/^\d+$/.test(id)) return;
    const rawProblemCode = String(data.problemCode || problemCodeFromPage() || "");
    const problemCode = /^[A-Za-z0-9_]{1,64}$/.test(rawProblemCode) ? rawProblemCode : null;
    if (data.type === "__SOLVEBASE_CC_SUBMITTED__") {
      if (!lastTrustedSubmitAt || Date.now() - lastTrustedSubmitAt > SUBMIT_TTL_MS) return;
      chrome.runtime
        .sendMessage({
          type: "codechef-witness",
          action: "set",
          data: { submissionId: id, problemCode: problemCode || undefined },
        })
        .catch(() => {});
      return;
    }
    if (data.type !== "__CF_SYNC_CC_ACCEPTED__") return;

    const submittedAt = consumeRecentSubmit();
    if (!submittedAt) return;
    report(id, problemCode, submittedAt);
  });
})();
