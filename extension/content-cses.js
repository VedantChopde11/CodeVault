// CSES live detection — WITNESS MODEL.
//
// CSES is server-rendered: a submit is a form POST that navigates to the result
// page. This script stashes a "pending" flag on the submit click, then reports
// ONLY when the result page shows ACCEPTED and a pending record exists within
// the TTL. A cold visit to an already-solved result page does nothing because
// no submit was clicked. It fails CLOSED.

(function () {
  "use strict";

  if (window.__codevaultCSESContentInstalled) return;
  window.__codevaultCSESContentInstalled = true;

  const PENDING_TTL = 15 * 60 * 1000;
  const seen = new Set();
  const reporting = new Set();
  let pending = null;
  let pendingLoaded = false;
  let scanning = false;

  function taskIdFromUrl() {
    // The submit form lives on /problemset/submit/<taskId>/, not on the task
    // page, so both URLs must seed the pending record.
    const m = location.pathname.match(/\/problemset\/(?:task|submit)\/(\d+)/i);
    return m ? m[1] : null;
  }

  function resultIdFromUrl() {
    const m = location.pathname.match(/\/problemset\/result\/(\d+)/i);
    return m ? m[1] : null;
  }

  function setPending(event) {
    if (!event?.isTrusted) return;
    const taskId = taskIdFromUrl();
    if (!taskId) return;
    pending = { taskId, time: Date.now() };
    pendingLoaded = true;
    chrome.runtime
      .sendMessage({ type: "cses-witness", action: "set", data: pending })
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
      const response = await chrome.runtime.sendMessage({ type: "cses-witness", action: "get" });
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
    chrome.runtime.sendMessage({ type: "cses-witness", action: "clear" }).catch(() => {});
  }

  // Capture-phase listeners fire before the form navigates to the result page.
  document.addEventListener("submit", setPending, true);
  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("input[type='submit'], button");
      const label =
        control instanceof HTMLInputElement
          ? control.value.trim().toLowerCase()
          : control?.textContent?.trim().toLowerCase() || "";
      if (control && (control.getAttribute("type") === "submit" || label === "submit")) {
        setPending(event);
      }
    },
    true,
  );

  function isAccepted() {
    // The result page shows the overall verdict in a summary row; per-test rows
    // repeat verdicts, so read the summary first and fall back to page text.
    const rows = document.querySelectorAll("table tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td, th");
      if (cells.length < 2) continue;
      if (!/^\s*result\s*:?\s*$/i.test(cells[0].textContent || "")) continue;
      return /ACCEPTED/i.test(cells[1].textContent || "");
    }
    const container = document.querySelector(".content") || document.body;
    const text = container.innerText || "";
    if (!/\bACCEPTED\b/i.test(text)) return false;
    return !/WRONG ANSWER|TIME LIMIT EXCEEDED|RUNTIME ERROR|COMPILE ERROR|OUTPUT LIMIT EXCEEDED/i.test(
      text,
    );
  }

  function getTaskIdFromResultPage() {
    for (const link of document.querySelectorAll('a[href*="/problemset/task/"]')) {
      const m = link.href.match(/\/problemset\/task\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  function getProblemName() {
    const t = document.querySelector(".title-block h1, .content h1, h1");
    return t ? t.textContent.trim() : null;
  }

  async function report(resultId, taskId) {
    const key = resultId || taskId;
    if (!key || seen.has(key) || reporting.has(key)) return;
    reporting.add(key);
    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: "cses-accepted",
            resultId,
            taskId,
            name: getProblemName(),
          });
          if (response?.ok) {
            seen.add(key);
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

  // The ONLY entry point. No pending → no report.
  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      const current = await getPending();
      if (!current) return;

      const resultId = resultIdFromUrl();
      if (!resultId) return;

      if (current.resultId !== resultId) {
        const response = await chrome.runtime
          .sendMessage({
            type: "cses-witness",
            action: "set",
            data: { taskId: current.taskId, resultId },
          })
          .catch(() => null);
        if (response?.witness) pending = response.witness;
      }
      if (!isAccepted()) return;

      const taskId = current.taskId || getTaskIdFromResultPage();
      report(resultId, taskId);
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
