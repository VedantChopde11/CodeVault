export function requestUrl(request) {
  return new URL(request.url || "/", "https://vercel.invalid");
}
export function clientIp(request) {
  for (const name of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const value = request.headers[name];
    const candidate = (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
    if (candidate && candidate.length <= 128 && !/[\u0000-\u001f\u007f]/.test(candidate)) {
      return candidate;
    }
  }
  return request.socket?.remoteAddress || "unknown";
}
export class PayloadTooLargeError extends Error {
  constructor(message = "Request body too large") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}
export const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
export async function readJson(request, maxBytes = 2048, timeoutMs = 3000) {
  const contentLengthHeader = request.headers?.["content-length"];
  if (contentLengthHeader) {
    const rawValue = Array.isArray(contentLengthHeader)
      ? contentLengthHeader[0]
      : contentLengthHeader;
    const contentLength = parseInt(rawValue ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new PayloadTooLargeError();
    }
  }
  if (request.body !== undefined) {
    let serialized;
    try {
      serialized = JSON.stringify(request.body);
    } catch {
      throw new Error("Invalid JSON body");
    }
    if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
      throw new PayloadTooLargeError();
    }
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      throw new Error("Invalid JSON body");
    }
    return request.body;
  }
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        request.destroy?.();
      } catch {
        // ignore
      }
      reject(new Error("Request body read timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
    };
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        settled = true;
        cleanup();
        body = "";
        reject(new PayloadTooLargeError());
      }
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        const parsed = JSON.parse(body || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("Invalid JSON body");
        resolve(parsed);
      } catch (error) {
        reject(error instanceof PayloadTooLargeError ? error : new Error("Invalid JSON body"));
      }
    });
    request.on("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Request body could not be read"));
    });
  });
}
export function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
export function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...SECURITY_HEADERS,
    ...headers,
  });
  response.end(JSON.stringify(body));
}
export function rateLimited(response, retryAfter, headers = {}) {
  sendJson(
    response,
    429,
    {
      error: "rate_limited",
    },
    {
      "Retry-After": String(retryAfter),
      ...headers,
    },
  );
}
export function payloadTooLarge(response, headers = {}) {
  sendJson(
    response,
    413,
    {
      error: "payload_too_large",
    },
    headers,
  );
}
export function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
    ...SECURITY_HEADERS,
  });
  response.end();
}
export function methodNotAllowed(response) {
  sendJson(
    response,
    405,
    {
      error: "method_not_allowed",
    },
    {
      Allow: "GET",
    },
  );
}
