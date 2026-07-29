/**
 * KOFIC(영화진흥위원회) 영화 상세정보 + TMDB 포스터 통합 모듈.
 * KOFIC에서 영화코드/개봉일/관람등급을 가져오고,
 * TMDB에서 포스터 URL을 보완한다.
 * 현재 상영작 통합은 src/lib/nowplaying.ts를参照.
 */

import { fetchWithRetry } from "./fetchWithRetry";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}가 설정되어 있지 않습니다.`);
  return value;
}

// 모듈 로드 시가 아닌 실제 사용 시점에 평가 (빌드 환경에 환경변수가 없어도 OK)
function getKoficKey(): string {
  return process.env.KOFIC_KEY || requireEnv("KOFIC_KEY");
}
function getTmdbKey(): string {
  return process.env.TMDB_KEY || requireEnv("TMDB_KEY");
}
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w300";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original";

export interface BoxOfficeMovie {
  movieCd: string;
  movieNm: string;
  movieNmEn?: string;
  rank: number;
  openDt: string; // YYYY-MM-DD
  audiAcc: number;
  scrnCnt: number;
  showCnt: number;
  prdtStatNm?: string;
  rating?: string;
  runtimeMin?: number;
  genres?: string[];
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
}

interface KoficMovieInfo {
  movieCd: string;
  movieNm: string;
  movieNmEn: string;
  showTm: string;
  openDt: string;
  prdtStatNm: string;
  genres?: { genreNm: string }[];
  audits?: { watchGradeNm: string }[];
}

interface TmdbInfo {
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
}

// TMDB 포스터/백드롭 캐시 (영화코드별 → TmdbInfo, 24시간)
const tmdbCache = new Map<string, { ts: number; data: TmdbInfo }>();
const TMDB_TTL = 24 * 60 * 60 * 1000;

function normalizeDate(openDt: string): string {
  // KOFIC openDt는 "YYYYMMDD" 또는 "YYYY-MM-DD"
  if (openDt.length === 8) {
    return `${openDt.slice(0, 4)}-${openDt.slice(4, 6)}-${openDt.slice(6, 8)}`;
  }
  return openDt;
}

/** 영화 상세정보 조회 (관람등급, 런타임, 장르) */
async function fetchMovieDetail(movieCd: string): Promise<KoficMovieInfo | null> {
  const url = `https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieInfo.json?key=${getKoficKey()}&movieCd=${movieCd}`;
  try {
    const res = await fetchWithRetry(url, {}, { timeoutMs: 8000, retries: 1 });
    const data = await res.json();
    return data?.movieInfoResult?.movieInfo || null;
  } catch {
    return null;
  }
}

function normalizeTitleForMatch(title: string): string {
  return title
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

/** 제목으로 KOFIC movieCd를 발굴한다. searchMovieList를 제목 기반으로 조회. */
export async function searchMovieByTitle(title: string): Promise<string | null> {
  try {
    const cleanTitle = title.replace(/\[[^\]]+\]/g, "").trim();
    const params = new URLSearchParams({
      key: getKoficKey(),
      movieNm: cleanTitle,
      itemPerPage: "10",
    });
    const url = `https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json?${params}`;
    const res = await fetchWithRetry(url, {}, { timeoutMs: 8000, retries: 1 });
    const data = await res.json();
    const items = data?.movieListResult?.movieList || [];
    if (items.length === 0) return null;
    const target = normalizeTitleForMatch(title);
    const exact = items.find(
      (it: { movieNm: string }) => normalizeTitleForMatch(it.movieNm) === target,
    );
    const match = exact || items[0];
    return match?.movieCd || null;
  } catch {
    return null;
  }
}

/** 영화 코드로 상세정보와 TMDB 이미지를 조회한다. */
export async function getMovieByCode(movieCd: string): Promise<BoxOfficeMovie | null> {
  const detail = await fetchMovieDetail(movieCd);
  if (!detail) return null;

  const openDt = normalizeDate(detail.openDt || "");
  const tmdb = await fetchTmdbInfo(detail.movieNm, detail.movieNmEn, openDt);

  return {
    movieCd: detail.movieCd,
    movieNm: detail.movieNm,
    movieNmEn: detail.movieNmEn || undefined,
    rank: 999,
    openDt,
    audiAcc: 0,
    scrnCnt: 0,
    showCnt: 0,
    prdtStatNm: detail.prdtStatNm,
    rating: detail.audits?.[0]?.watchGradeNm,
    runtimeMin: detail.showTm ? parseInt(detail.showTm, 10) : undefined,
    genres: detail.genres?.map((genre) => genre.genreNm),
    ...tmdb,
  };
}

/** TMDB에서 영화 포스터 + 백드롭 + 줄거리 검색 */
async function fetchTmdbInfo(movieNm: string, movieNmEn?: string, openDt?: string): Promise<TmdbInfo> {
  const cacheKey = `${movieNm}|${openDt || ""}`;
  const cached = tmdbCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TMDB_TTL) return cached.data;

  const empty: TmdbInfo = {};
  try {
    const params = new URLSearchParams({
      api_key: getTmdbKey(),
      query: movieNm,
      language: "ko-KR",
      region: "KR",
    });
    if (openDt) {
      const year = openDt.slice(0, 4);
      if (year && year !== "undefined") params.set("year", year);
    }
    const res = await fetchWithRetry(`https://api.themoviedb.org/3/search/movie?${params}`, {}, { timeoutMs: 8000, retries: 1 });
    const data = await res.json();
    const results = data?.results || [];

    const withPoster = results.filter((r: { poster_path?: string; release_date?: string }) => r.poster_path);
    let best = withPoster[0];

    if (openDt && withPoster.length > 1) {
      const target = openDt.slice(0, 4);
      best = withPoster.find(
        (r: { release_date?: string }) => r.release_date?.startsWith(target),
      ) || best;
    }

    if (!best && movieNmEn) {
      const paramsEn = new URLSearchParams({
        api_key: getTmdbKey(),
        query: movieNmEn,
        language: "en-US",
      });
      const resEn = await fetchWithRetry(`https://api.themoviedb.org/3/search/movie?${paramsEn}`, {}, { timeoutMs: 8000, retries: 1 });
      const dataEn = await resEn.json();
      const resultsEn = dataEn?.results || [];
      best = resultsEn.find((r: { poster_path?: string }) => r.poster_path);
    }

    const info: TmdbInfo = {
      posterUrl: best?.poster_path ? `${TMDB_IMG_BASE}${best.poster_path}` : undefined,
      backdropUrl: best?.backdrop_path ? `${TMDB_BACKDROP_BASE}${best.backdrop_path}` : undefined,
      overview: best?.overview || undefined,
    };
    tmdbCache.set(cacheKey, { ts: Date.now(), data: info });
    return info;
  } catch {
    tmdbCache.set(cacheKey, { ts: Date.now(), data: empty });
    return empty;
  }
}
