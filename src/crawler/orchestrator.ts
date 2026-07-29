import type { CrawledShowtime, Theater } from "../lib/types";
import { crawlCgv } from "./cgv";
import { crawlMegabox } from "./megabox";
import { crawlLotte, getLottePageData } from "./lotte";
import { dateIso } from "./dates";
import { memoizeTTL } from "../lib/memoizeTTL";
import { mapWithLimit } from "../lib/concurrency";

const TTL_MS = 10 * 60 * 1000;

// 체인별 동시성 제한 — 레이트리밋 회피
const CONCURRENCY: Record<string, number> = {
  MEGABOX: 3, // ECONNRESET 빈발, 가장 보수적
  CGV: 5,     // got-scraping, Cloudflare 우회
  LOTTE: 5,
};

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

/** 한 지역의 모든 영화관을 체인별 동시성 제한하에 크롤링 */
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

  // 체인별로 그룹화 → 각 체인은 동시성 제한하에 배치 처리
  // 체인끼리는 병렬이 유지되므로 전체 응답 시간은 크게 늘지 않음
  const byChain = new Map<string, Theater[]>();
  for (const t of theaters) {
    if (!byChain.has(t.chain)) byChain.set(t.chain, []);
    byChain.get(t.chain)!.push(t);
  }

  const chainResults = await Promise.all(
    [...byChain.entries()].map(([chain, chainTheaters]) => {
      const maxConcurrent = CONCURRENCY[chain] ?? 5;
      return mapWithLimit(chainTheaters, maxConcurrent, (theater) =>
        crawlTheater(theater, date, movieTitle).catch((e) => {
          console.error(`[crawler] ${theater.chain} ${theater.name} 실패:`, e instanceof Error ? e.message : e);
          return [] as CrawledShowtime[];
        }),
      );
    }),
  );

  // chainResults: CrawledShowtime[][][] → 체인별 [극장별 showtimes] → 2단 flat
  return chainResults.flat(2) as CrawledShowtime[];
}