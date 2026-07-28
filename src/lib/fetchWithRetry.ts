/**
 * 타임아웃 + 지터 백오프 재시도를 지원하는 fetch 래퍼.
 * 일시적 네트워크 오류, 5xx, 429에 재시도한다.
 * 4xx(429 제외)는 재시도하지 않는다.
 */

interface RetryOptions {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  retries: 2,
  timeoutMs: 10_000,
  baseDelayMs: 500,
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function jitter(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * baseMs);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const { retries, timeoutMs, baseDelayMs } = { ...DEFAULTS, ...opts };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: init.signal ?? controller.signal,
      });

      if (!res.ok && isRetryableStatus(res.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, jitter(baseDelayMs * (attempt + 1))));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const isAbort = lastError.name === "AbortError";
      const isLast = attempt >= retries;

      if (isLast || !isAbort) {
        // 타임아웃이 아닌 네트워크 오류도 재시도
        if (!isLast && attempt < retries) {
          await new Promise((r) => setTimeout(r, jitter(baseDelayMs * (attempt + 1))));
          continue;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("fetchWithRetry 실패");
}