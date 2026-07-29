/**
 * 동시성 제한 세마포.
 * Promise.all로 수십 개 요청을 동시에 쏘는 대신, 최대 N개만 동시 실행.
 * 레이트리밋 회피를 위한 핵심 유틸.
 */

export function createLimiter(maxConcurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            const next = queue.shift();
            if (next) next();
          });
      };

      if (active < maxConcurrency) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  }

  return run;
}

/**
 * 배열을 동시성 제한하에 병렬 처리.
 * Promise.all과 동일하지만 동시 실행 수를 maxConcurrency로 제한.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = createLimiter(maxConcurrency);
  return Promise.all(
    items.map((item, index) => limit(() => fn(item, index))),
  );
}