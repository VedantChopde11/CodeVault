(function () {
  "use strict";

  if (window.__codevaultLeetCodeMainInstalled) return;
  window.__codevaultLeetCodeMainInstalled = true;

  const SUBMIT_TTL_MS = 10 * 60 * 1000;
  const MAX_RESPONSE_CHARS = 1024 * 1024;
  const emitted = new Set();
  const submitted = new Set();
  const pending = new Map();
  let lastTrustedSubmitAt = 0;
  let lastSubmitRequestAt = 0;
  let lastStatusSubmissionId = null;

  function controlLabel(target) {
    if (!(target instanceof Element)) return "";
    const control = target.closest("button, [role='button']");
    if (!control) return "";
    return [
      control.getAttribute("data-e2e-locator"),
      control.getAttribute("data-cy"),
      control.getAttribute("data-testid"),
      control.getAttribute("aria-label"),
      control.textContent,
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
      label.includes("console-submit-button") ||
      label.includes("submit-code") ||
      label.includes("submit code") ||
      label.includes("submit solution")
    );
  }

  document.addEventListener(
    "click",
    (event) => {
      if (event.isTrusted && isSubmitControl(event.target)) lastTrustedSubmitAt = Date.now();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isTrusted && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        lastTrustedSubmitAt = Date.now();
      }
    },
    true,
  );

  function recent(timestamp) {
    return timestamp > 0 && Date.now() - timestamp <= SUBMIT_TTL_MS;
  }

  function parsedUrl(url) {
    try {
      return new URL(url, location.href);
    } catch {
      return null;
    }
  }

  function isSubmissionStart(url, method) {
    const parsed = parsedUrl(url);
    return (
      parsed?.origin === location.origin &&
      String(method).toUpperCase() === "POST" &&
      /\/problems\/[^/]+\/submit\/?$/i.test(parsed.pathname)
    );
  }

  function isPotentialSubmissionStart(url, method) {
    const parsed = parsedUrl(url);
    return (
      parsed?.origin === location.origin &&
      String(method).toUpperCase() === "POST" &&
      recent(lastTrustedSubmitAt)
    );
  }

  function statusSubmissionId(url) {
    const path = parsedUrl(url)?.pathname || "";
    return path.match(/\/submissions\/detail\/(\d+)\/check\/?$/i)?.[1] || null;
  }

  function isRelevantRequest(url, method) {
    return isSubmissionStart(url, method) || Boolean(statusSubmissionId(url));
  }

  function requestInfo(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    return { url: String(url), method };
  }

  function slugFromLocation() {
    const slug = location.pathname.match(/\/problems\/([^/]+)/i)?.[1] || "";
    return /^[a-z0-9-]{1,180}$/i.test(slug) ? slug : null;
  }

  function payloadId(data, url) {
    const id =
      data.submission_id ||
      data.submissionId ||
      data.id ||
      data.data?.submission_id ||
      data.data?.submissionId ||
      data.data?.submitSolution?.submissionId ||
      data.submitSolution?.submissionId ||
      statusSubmissionId(url);
    return /^\d+$/.test(String(id || "")) ? String(id) : null;
  }

  function isAccepted(data) {
    const status = [
      data.status_msg,
      data.statusMsg,
      data.status,
      data.state,
      data.data?.status_msg,
      data.data?.statusMsg,
      data.data?.status,
      data.data?.state,
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(" ");
    if (/\baccepted\b/i.test(status)) return true;

    const statusCode = Number(data.status_code ?? data.statusCode ?? data.data?.status_code);
    const finished = data.finished ?? data.data?.finished;
    const state = String(data.state || data.data?.state || "");
    return statusCode === 10 && (finished === true || /success/i.test(state));
  }

  function emitAccepted(id) {
    const numericId = /^\d+$/.test(String(id || "")) ? String(id) : null;
    const slug = slugFromLocation();
    const key = numericId || `slug:${slug || "unknown"}`;
    if (emitted.has(key)) return;

    emitted.add(key);
    lastTrustedSubmitAt = 0;
    lastSubmitRequestAt = 0;
    window.postMessage(
      {
        type: "__SOLVEBASE_LC_ACCEPTED__",
        submissionId: numericId || undefined,
        slug,
      },
      location.origin,
    );
  }

  function emitSubmitted(id) {
    const numericId = /^\d+$/.test(String(id || "")) ? String(id) : null;
    if (!numericId || submitted.has(numericId)) return;
    submitted.add(numericId);
    window.postMessage(
      {
        type: "__SOLVEBASE_LC_SUBMITTED__",
        submissionId: numericId,
        slug: slugFromLocation(),
      },
      location.origin,
    );
  }

  function inspect(url, method, text) {
    const relevant = isRelevantRequest(url, method);
    if (!text || text.length > MAX_RESPONSE_CHARS || !relevant) return;

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }

    const id = payloadId(data, url);
    const statusId = statusSubmissionId(url);
    if (statusId) lastStatusSubmissionId = statusId;

    if (id && recent(lastTrustedSubmitAt) && String(method).toUpperCase() === "POST") {
      lastSubmitRequestAt = Date.now();
      pending.set(id, Date.now());
      emitSubmitted(id);
    }

    if (!id || !isAccepted(data)) return;

    const pendingAt = pending.get(id) || 0;
    if (!recent(pendingAt) && !recent(lastSubmitRequestAt) && !recent(lastTrustedSubmitAt)) return;

    pending.delete(id);
    emitAccepted(id);
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (...args) {
      const { url, method } = requestInfo(args[0], args[1]);
      const shouldInspect = isRelevantRequest(url, method);
      if (isPotentialSubmissionStart(url, method)) {
        lastSubmitRequestAt = Date.now();
      }
      return nativeFetch.apply(this, args).then((response) => {
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (shouldInspect && (!contentLength || contentLength <= MAX_RESPONSE_CHARS)) {
          response
            .clone()
            .text()
            .then((text) => inspect(url, method, text))
            .catch(() => {});
        }
        return response;
      });
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__codevaultLeetCodeUrl = String(url || "");
    this.__codevaultLeetCodeMethod = String(method || "GET").toUpperCase();
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__codevaultLeetCodeUrl || "";
    const method = this.__codevaultLeetCodeMethod || "GET";
    const shouldInspect = isRelevantRequest(url, method);
    if (isPotentialSubmissionStart(url, method)) {
      lastSubmitRequestAt = Date.now();
    }
    if (shouldInspect) {
      this.addEventListener("load", () => inspect(url, method, this.responseText), { once: true });
    }
    return nativeSend.apply(this, args);
  };

  function submissionIdFrom(root) {
    if (!(root instanceof Element) && root !== document) return null;
    const directHref = root instanceof Element ? root.getAttribute("href") : null;
    const directId = directHref?.match(/\/submissions\/detail\/(\d+)/i)?.[1];
    if (directId) return directId;
    const link = root.querySelector?.('a[href*="/submissions/detail/"]');
    return link?.getAttribute("href")?.match(/\/submissions\/detail\/(\d+)/i)?.[1] || null;
  }

  function containsAcceptedResult(root) {
    const candidates = [root, ...root.querySelectorAll("div, span, p, h2, h3")];
    return candidates.some((element) => {
      if (element.children.length > 0) return false;
      const text = String(element.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      return /^accepted!?$/i.test(text);
    });
  }

  const resultObserver = new MutationObserver((mutations) => {
    if (!recent(lastTrustedSubmitAt)) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (!containsAcceptedResult(node)) continue;
        emitAccepted(
          submissionIdFrom(node) || lastStatusSubmissionId || submissionIdFrom(document),
        );
        return;
      }
    }
  });

  function observeResults() {
    if (!document.documentElement) return false;
    resultObserver.observe(document.documentElement, { childList: true, subtree: true });
    return true;
  }

  if (!observeResults()) {
    document.addEventListener("DOMContentLoaded", observeResults, { once: true });
  }
})();
