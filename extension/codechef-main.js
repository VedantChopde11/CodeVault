(function () {
  "use strict";

  if (window.__codevaultCodeChefMainInstalled) return;
  window.__codevaultCodeChefMainInstalled = true;

  const SUBMIT_TTL_MS = 10 * 60 * 1000;
  const MAX_RESPONSE_CHARS = 1024 * 1024;
  const seen = new Set();
  const submitted = new Set();
  let lastTrustedSubmitAt = 0;
  let lastSubmitRequestAt = 0;
  let lastSubmissionId = null;

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
  document.addEventListener(
    "submit",
    (event) => {
      if (event.isTrusted) lastTrustedSubmitAt = Date.now();
    },
    true,
  );

  function recent(timestamp) {
    return timestamp > 0 && Date.now() - timestamp <= SUBMIT_TTL_MS;
  }

  function requestInfo(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    return { url: String(url), method };
  }

  function parsedUrl(url) {
    try {
      return new URL(url, location.href);
    } catch {
      return null;
    }
  }

  function pathOf(url) {
    return parsedUrl(url)?.pathname || "";
  }

  function isSubmissionStart(url, method) {
    if (!/^(POST|PUT)$/i.test(method)) return false;
    const path = pathOf(url);
    return (
      /\/api\/ide\/submit\/?$/i.test(path) ||
      /\/submit\/?$/i.test(path) ||
      /\/api\/submission\/?$/i.test(path)
    );
  }

  function isSubmissionRequest(url) {
    const path = pathOf(url);
    return /\/api\/ide\/(?:submit|submission)|\/api\/submission|\/submit\/?$/i.test(path);
  }

  function isPotentialSubmissionStart(url, method) {
    const parsed = parsedUrl(url);
    return (
      parsed?.origin === location.origin &&
      /^(POST|PUT)$/i.test(method) &&
      recent(lastTrustedSubmitAt)
    );
  }

  function noteSubmissionStart(url, method) {
    if (
      recent(lastTrustedSubmitAt) &&
      (isSubmissionStart(url, method) || isPotentialSubmissionStart(url, method))
    ) {
      lastSubmitRequestAt = Date.now();
    }
  }

  function accepted(payload) {
    const values = [
      payload.result_code,
      payload.resultCode,
      payload.status,
      payload.status_msg,
      payload.verdict,
      payload.data?.result_code,
      payload.data?.status,
      payload.data?.verdict,
      payload.result?.result_code,
      payload.result?.status,
      payload.result?.verdict,
      payload.other_details?.resultCode,
    ]
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value).trim().toLowerCase());
    return (
      values.some(
        (value) => value === "accepted" || value === "ac" || value === "correct answer",
      ) ||
      Number(
        payload.status_code ??
          payload.statusCode ??
          payload.result_code ??
          payload.data?.status_code ??
          payload.other_details?.statusCode,
      ) === 15
    );
  }

  function submissionId(payload, url) {
    const parsed = parsedUrl(url);
    const pathId = parsed?.pathname.match(
      /\/(?:viewsolution|viewplaintext|submission|submissions)\/(\d+)/i,
    )?.[1];
    const queryId = ["submission_id", "submissionId", "solution_id", "solutionId", "id"]
      .map((key) => parsed?.searchParams.get(key))
      .find((value) => /^\d+$/.test(String(value || "")));
    const id =
      payload.submission_id ||
      payload.submissionId ||
      payload.solution_id ||
      payload.solutionId ||
      payload.upid ||
      payload.id ||
      payload.data?.submission_id ||
      payload.data?.solution_id ||
      payload.result?.submission_id ||
      payload.result?.solution_id ||
      queryId ||
      pathId;
    return /^\d+$/.test(String(id || "")) ? String(id) : null;
  }

  function emitAccepted(id, payload = {}) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    lastTrustedSubmitAt = 0;
    lastSubmitRequestAt = 0;
    lastSubmissionId = null;

    const body =
      payload.data && typeof payload.data === "object" ? { ...payload.data, ...payload } : payload;
    const rawProblemCode =
      body.problemCode ||
      body.problem_code ||
      body.result?.problemCode ||
      body.other_details?.problemCode ||
      null;
    const problemCode = /^[A-Za-z0-9_]{1,64}$/.test(String(rawProblemCode || ""))
      ? String(rawProblemCode)
      : null;

    window.postMessage(
      {
        type: "__CF_SYNC_CC_ACCEPTED__",
        submissionId: id,
        problemCode,
      },
      location.origin,
    );
  }

  function emitSubmitted(id, payload = {}) {
    if (!id || submitted.has(id)) return;
    submitted.add(id);
    const body =
      payload.data && typeof payload.data === "object" ? { ...payload.data, ...payload } : payload;
    const rawProblemCode =
      body.problemCode ||
      body.problem_code ||
      body.result?.problemCode ||
      body.other_details?.problemCode ||
      null;
    const problemCode = /^[A-Za-z0-9_]{1,64}$/.test(String(rawProblemCode || ""))
      ? String(rawProblemCode)
      : null;
    window.postMessage(
      {
        type: "__SOLVEBASE_CC_SUBMITTED__",
        submissionId: id,
        problemCode,
      },
      location.origin,
    );
  }

  function handlePayload(payload, url) {
    if (!payload || typeof payload !== "object" || !recent(lastSubmitRequestAt)) return;
    const body =
      payload.data && typeof payload.data === "object" ? { ...payload.data, ...payload } : payload;
    const id = submissionId(body, url);
    if (id) {
      lastSubmissionId = id;
      emitSubmitted(id, body);
    }
    if (accepted(body)) emitAccepted(id || lastSubmissionId, body);
  }

  function inspect(url, method, text) {
    const relevant = isSubmissionRequest(url);
    if (!relevant || !text || text.length > MAX_RESPONSE_CHARS) return;
    try {
      handlePayload(JSON.parse(text), url);
    } catch {}
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (...args) {
      const { url, method } = requestInfo(args[0], args[1]);
      noteSubmissionStart(url, method);
      const shouldInspect = isSubmissionRequest(url);
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
    this.__codevaultCodeChefUrl = String(url || "");
    this.__codevaultCodeChefMethod = String(method || "GET").toUpperCase();
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__codevaultCodeChefUrl || "";
    const method = this.__codevaultCodeChefMethod || "GET";
    noteSubmissionStart(url, method);
    if (isSubmissionRequest(url)) {
      this.addEventListener("load", () => inspect(url, method, this.responseText), { once: true });
    }
    return nativeSend.apply(this, args);
  };

  function submissionIdFrom(root) {
    if (!(root instanceof Element) && root !== document) return null;
    const selectors = [
      'a[href*="/viewsolution/"]',
      'a[href*="/viewplaintext/"]',
      'a[href*="/submission/"]',
      'a[href*="/submissions/"]',
    ].join(",");
    const elements = root instanceof Element && root.matches(selectors) ? [root] : [];
    const link = elements[0] || root.querySelector?.(selectors);
    return link?.getAttribute("href")?.match(/\/(\d+)(?:[/?#]|$)/)?.[1] || null;
  }

  function containsAcceptedResult(root) {
    const candidates = [root, ...root.querySelectorAll("div, span, p, h2, h3")];
    return candidates.some((element) => {
      if (element.children.length > 0) return false;
      const text = String(element.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      return /^(?:accepted|correct answer)!?$/i.test(text);
    });
  }

  const resultObserver = new MutationObserver((mutations) => {
    if (!recent(lastTrustedSubmitAt) && !recent(lastSubmitRequestAt)) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element) || !containsAcceptedResult(node)) continue;
        const id = submissionIdFrom(node) || lastSubmissionId || submissionIdFrom(document);
        if (id) emitAccepted(id);
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
