/**
 * TTL 기반 캐시 + 진행 중인 Promise 재사용(single-flight) 헬퍼.
 * 동일 키에 대한 동시 호출은 한 번만 실행하고 결과를 공유한다.
 */

interface Entry<T> {
  ts: number;
  data: T;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function memoizeTTL<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = store.get(key) as Entry<T> | undefined;
  if (cached && Date.now() - cached.ts < ttlMs) {
    return Promise.resolve(cached.data);
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await fn();
      store.set(key, { ts: Date.now(), data });
      return data;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** 캐시에서 특정 키 삭제 (테스트/무효화용) */
export function invalidate(key: string): void {
  store.delete(key);
  inflight.delete(key);
}