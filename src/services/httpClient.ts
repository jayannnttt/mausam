/**
 * Small HTTP helper with timeout + bounded retry, shared by all services.
 * Retries only network failures and 5xx/429 responses — never 4xx.
 */

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} from ${url}`);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  /** Extra headers, e.g. IMD API key. */
  headers?: Record<string, string>;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 12_000, retries = 2, headers } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", ...headers },
      });
      if (!res.ok) {
        const err = new HttpError(res.status, url);
        // Retry only transient statuses.
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          lastError = err;
          await backoff(attempt);
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof HttpError && !(e.status >= 500 || e.status === 429)) throw e;
      lastError = e;
      if (attempt < retries) {
        await backoff(attempt);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function backoff(attempt: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
}

/** Turn any thrown value into a user-readable message. */
export function describeError(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403)
      return `The data provider rejected the request (HTTP ${e.status}). An API key may be required.`;
    if (e.status === 404) return "The data provider has no data for this location (HTTP 404).";
    if (e.status === 429) return "The data provider is rate-limiting requests. Try again in a minute.";
    return `The data provider returned an error (HTTP ${e.status}).`;
  }
  if (e instanceof DOMException && e.name === "AbortError")
    return "The request timed out. The network or the data provider may be slow.";
  if (e instanceof TypeError)
    return "Could not reach the data provider. Check the network connection.";
  return e instanceof Error ? e.message : "An unexpected error occurred.";
}
