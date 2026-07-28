import { NextResponse } from "next/server";
import { getTheatersByRegion } from "../../../crawler/theaters";
import { crawlTheaters } from "../../../crawler/orchestrator";
import type { CrawledShowtime } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ApiShowtime {
  id: string;
  chain: string;
  theaterId: string;
  theaterName: string;
  movieTitle: string;
  screenName: string;
  screenType: string;
  startTime: string;
  endTime: string;
  totalSeats: number;
  remainingSeats: number;
}

function normalizeMovieTitle(title: string): string {
  return title
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const regionId = searchParams.get("region");
  const movieTitle = searchParams.get("movie");
  const chainFilter = searchParams.get("chain");
  const dateParam = searchParams.get("date");

  if (!regionId) {
    return NextResponse.json(
      { error: "region 파라미터가 필요합니다" },
      { status: 400 },
    );
  }

  let targets = await getTheatersByRegion(regionId);
  if (chainFilter) {
    targets = targets.filter((t: { chain: string }) => t.chain === chainFilter.toUpperCase());
  }
  if (targets.length === 0) {
    return NextResponse.json(
      { error: "해당 지역에 등록된 영화관이 없습니다", showtimes: [] },
      { status: 404 },
    );
  }

  // 날짜 파라미터 파싱 (YYYY-MM-DD 또는 YYYYMMDD)
  let date = new Date();
  if (dateParam) {
    const d = dateParam.length === 8
      ? `${dateParam.slice(0, 4)}-${dateParam.slice(4, 6)}-${dateParam.slice(6, 8)}`
      : dateParam;
    const parsed = new Date(`${d}T00:00:00+09:00`);
    if (!isNaN(parsed.getTime())) date = parsed;
  }

  let crawled: CrawledShowtime[];
  try {
    crawled = await crawlTheaters(targets, date, movieTitle || undefined);
  } catch (e) {
    return NextResponse.json(
      { error: "크롤링 실패", detail: e instanceof Error ? e.message : String(e), showtimes: [] },
      { status: 502 },
    );
  }

  let filtered = crawled;
  if (movieTitle) {
    const q = normalizeMovieTitle(movieTitle);
    filtered = filtered.filter((s) => {
      const title = normalizeMovieTitle(s.movieTitle);
      return title === q || title.includes(q) || q.includes(title);
    });
  }

  const showtimes: ApiShowtime[] = filtered.map((s) => ({
    id: s.id,
    chain: s.chain,
    theaterId: s.chainTheaterId,
    theaterName: s.chainTheaterName,
    movieTitle: movieTitle || s.movieTitle,
    screenName: s.screenName,
    screenType: s.screenType,
    startTime: s.startTime,
    endTime: s.endTime,
    totalSeats: s.totalSeats,
    remainingSeats: s.remainingSeats,
  }));

  // 영화 목록은 크롤 결과에서 추출 (상영된 영화만)
  const movieSet = new Map<string, string>();
  for (const s of crawled) {
    if (!movieSet.has(s.movieTitle)) movieSet.set(s.movieTitle, s.movieTitle);
  }
  const movies = [...movieSet.entries()].map(([id, title]) => ({ id, title }));

  return NextResponse.json({
    region: regionId,
    theaterCount: targets.length,
    movieCount: movies.length,
    movies,
    showtimes,
    crawledAt: new Date().toISOString(),
  });
}
