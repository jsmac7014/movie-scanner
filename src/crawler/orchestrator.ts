import type { CrawledShowtime, Theater } from "../lib/types";
import { crawlCgv } from "./cgv";
import { crawlMegabox } from "./megabox";
import { crawlLotte, getLottePageData } from "./lotte";
import { dateIso } from "./dates";
import { memoizeTTL } from "../lib/memoizeTTL";

const TTL_MS = 5 * 60 * 1000;

function cacheKey(theater: Theater, date: Date, movieTitle?: string): string {
  return `${theater.chain}:${theater.chainTheaterId}:${dateIso(date)}:${movieTitle || "ALL"}`;
}

export async function crawlTheater(
  theater: Theater,
  date = new Date(),
  movieTitle?: string,
): Promise<CrawledShowtime[]> {
  const key = cacheKey(theater, date, movieTitle);
  return memoizeTTL(key, TTL_MS, async () => {
    switch (theater.chain) {
      case "CGV":
        return crawlCgv(theater.chainTheaterId, theater.name, date, movieTitle);
      case "MEGABOX":
        return crawlMegabox(theater.chainTheaterId, theater.name, date, movieTitle);
      case "LOTTE":
        return crawlLotte(theater.chainTheaterId, theater.name, date, movieTitle);
      default:
        return [];
    }
  });
}

/** 한 지역의 모든 영화관을 체인별로 병렬 크롤링 */
export async function crawlTheaters(
  theaters: Theater[],
  date = new Date(),
  movieTitle?: string,
): Promise<CrawledShowtime[]> {
  // 롯데 영화관들은 GetTicketingPageTOBE(190KB)를 공유하므로 한 번만 호출
  const lotteTheaters = theaters.filter((t) => t.chain === "LOTTE");
  if (lotteTheaters.length > 0) {
    try {
      await getLottePageData();
    } catch (e) {
      console.error("[crawler] 롯데 TOBE 사전 로드 실패:", e instanceof Error ? e.message : e);
    }
  }

  // 모든 영화관을 동시에 크롤링 (각 크롤러 내부에서 캐시/병렬 처리)
  const results = await Promise.all(
    theaters.map((t) =>
      crawlTheater(t, date, movieTitle).catch((e) => {
        console.error(`[crawler] ${t.chain} ${t.name} 실패:`, e instanceof Error ? e.message : e);
        return [] as CrawledShowtime[];
      }),
    ),
  );
  return results.flat();
}
