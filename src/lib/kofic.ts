/**
 * KOFIC(영화진흥위원회) 박스오피스 API + TMDB 포스터 통합 모듈.
 * KOFIC에서 박스오피스 순위/영화코드/개봉일/관람등급을 가져오고,
 * TMDB에서 포스터 URL을 보완한다.
 */

import { daysAgoKstCompact, kstMidnight } from "../crawler/dates";
import { fetchWithRetry } from "./fetchWithRetry";
import { memoizeTTL } from "./memoizeTTL";
import { getMegaMovies } from "../crawler/megabox";

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

interface KoficDailyItem {
  movieCd: string;
  movieNm: string;
  rank: string;
  openDt: string;
  audiAcc: string;
  scrnCnt: string;
  showCnt: string;
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

// 캐시: 박스오피스 + 상세정보 (1시간, single-flight)
const BO_TTL = 60 * 60 * 1000;
const BO_KEY = "kofic:boxOffice";

interface TmdbInfo {
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
}

// TMDB 포스터/백드롭 캐시 (영화코드별 → TmdbInfo, 24시간)
const tmdbCache = new Map<string, { ts: number; data: TmdbInfo }>();
const TMDB_TTL = 24 * 60 * 60 * 1000;

function dateCompactDaysAgo(days: number): string {
  return daysAgoKstCompact(days);
}

function normalizeDate(openDt: string): string {
  // KOFIC openDt는 "YYYYMMDD" 또는 "YYYY-MM-DD"
  if (openDt.length === 8) {
    return `${openDt.slice(0, 4)}-${openDt.slice(4, 6)}-${openDt.slice(6, 8)}`;
  }
  return openDt;
}

/** 일별 박스오피스에서 상영중 영화 목록 조회 */
async function fetchDailyBoxOffice(targetDate: string): Promise<KoficDailyItem[]> {
  const url = `https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json?key=${getKoficKey()}&targetDt=${targetDate}`;
  const res = await fetchWithRetry(url, {}, { timeoutMs: 8000, retries: 2 });
  const data = await res.json();
  return data?.boxOfficeResult?.dailyBoxOfficeList || [];
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

/**
 * 박스오피스 기반 상영중 영화 목록 + TMDB 포스터 통합 조회.
 * - 최근 7일 박스오피스를 합쳐 중복 제거
 * - 각 영화의 상세정보(등급/런타임) 보완
 * - TMDB에서 포스터 URL 보완
 */
export async function getBoxOfficeMovies(): Promise<BoxOfficeMovie[]> {
  return memoizeTTL(BO_KEY, BO_TTL, async () => {
    // 최근 7일 박스오피스 합치기 (순위 변동과 사전 예매작까지 커버)
    const dates = [1, 2, 3, 4, 5, 6, 7].map((d) => dateCompactDaysAgo(d));
    const allItems = await Promise.all(dates.map((d) => fetchDailyBoxOffice(d)));

    // 중복 제거 (movieCd 기준), 최고 순위 + 최대 스크린 수 유지
    const byCode = new Map<string, KoficDailyItem>();
    const maxScrnByCode = new Map<string, number>();
    for (const items of allItems) {
      for (const item of items) {
        const prev = byCode.get(item.movieCd);
        const scrn = parseInt(item.scrnCnt, 10) || 0;
        if (!prev) {
          byCode.set(item.movieCd, item);
          maxScrnByCode.set(item.movieCd, scrn);
        } else if (scrn > (maxScrnByCode.get(item.movieCd) ?? 0)) {
          // 더 많은 스크린 수가 관찰된 날의 데이터로 대체
          byCode.set(item.movieCd, item);
          maxScrnByCode.set(item.movieCd, scrn);
        }
      }
    }

    // 박스오피스 아이템을 BoxOfficeMovie로 변환
    // 실제 극장에서 상영하지 않는(스크린 수 미달) 영화 제외
    const MIN_SCREEN_COUNT = 5;
    const movies: BoxOfficeMovie[] = [...byCode.values()]
      .filter((item) => (maxScrnByCode.get(item.movieCd) ?? 0) >= MIN_SCREEN_COUNT)
      .map((item) => ({
        movieCd: item.movieCd,
        movieNm: item.movieNm,
        rank: parseInt(item.rank, 10),
        openDt: normalizeDate(item.openDt),
        audiAcc: parseInt(item.audiAcc, 10) || 0,
        scrnCnt: maxScrnByCode.get(item.movieCd) ?? 0,
        showCnt: parseInt(item.showCnt, 10) || 0,
      }));

    // 상세정보 + TMDB 포스터를 병렬로 보완
    const detailsPromises = movies.map((m) => fetchMovieDetail(m.movieCd));
    const details = await Promise.all(detailsPromises);

    movies.forEach((m, i) => {
      const detail = details[i];
      if (detail) {
        m.movieNmEn = detail.movieNmEn || undefined;
        m.runtimeMin = detail.showTm ? parseInt(detail.showTm, 10) : undefined;
        m.prdtStatNm = detail.prdtStatNm;
        m.genres = detail.genres?.map((g) => g.genreNm);
        m.rating = detail.audits?.[0]?.watchGradeNm;
        if (detail.openDt) m.openDt = normalizeDate(detail.openDt);
      }
    });

    // TMDB 포스터 + 백드롭 병렬 조회
    const tmdbPromises = movies.map((m) =>
      fetchTmdbInfo(m.movieNm, m.movieNmEn, m.openDt),
    );
    const tmdbResults = await Promise.all(tmdbPromises);
    movies.forEach((m, i) => {
      m.posterUrl = tmdbResults[i].posterUrl;
      m.backdropUrl = tmdbResults[i].backdropUrl;
      m.overview = tmdbResults[i].overview;
    });

    // 순위순 정렬
    movies.sort((a, b) => a.rank - b.rank);

    return movies;
  });
}

/** 개봉 예정작 조회 (KOFIC 영화목록 API에서 개봉예정 필터) */
export async function getUpcomingMovies(): Promise<BoxOfficeMovie[]> {
  try {
    const url = `https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json?key=${getKoficKey()}&openStartDt=${new Date().getFullYear()}&itemPerPage=100`;
    const res = await fetchWithRetry(url, {}, { timeoutMs: 8000, retries: 2 });
    const data = await res.json();
    const items = data?.movieListResult?.movieList || [];

    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    const twoWeeksLater = now + 14 * 24 * 60 * 60 * 1000;

    // 메가박스 실제 상영목록을 화이트리스트로 사용.
    // KOFIC searchMovieList에는 에로/성인영화도 섞여 있어서,
    // 과거 openDt를 허용하면 "현재 상영작"으로 누출된다.
    // 메가박스에서 예매 가능한 영화만 통과시켜 실제 극장 상영 여부 검증.
    const megaMovies = await getMegaMovies();
    const megaTitles = new Set(
      megaMovies.map((m) => normalizeTitleForMatch(m.title)),
    );

    const upcoming: BoxOfficeMovie[] = items
      .filter((item: { prdtStatNm?: string; openDt?: string; movieNm: string }) => {
        if (!item.openDt) return false;
        const ts = kstMidnight(normalizeDate(item.openDt));
        // 범위: 3일 전 ~ 2주 후. 3일 전을 포함하는 이유는 KOFIC 일별
        // 박스오피스가 하루 늦게 발표되어 개봉 당일/익일 작이 누락되기 때문.
        if (ts < threeDaysAgo || ts > twoWeeksLater) return false;
        // 미래 개봉작은 그대로 노출(예매 가능 예정작).
        // 과거/오늘 개봉작은 메가박스 화이트리스트에 있어야만 통과.
        if (ts <= now) {
          return megaTitles.has(normalizeTitleForMatch(item.movieNm));
        }
        return true;
      })
      .map((item: { movieCd: string; movieNm: string; openDt?: string; movieNmEn?: string }) => ({
        movieCd: item.movieCd,
        movieNm: item.movieNm,
        movieNmEn: item.movieNmEn || undefined,
        rank: 999,
        openDt: normalizeDate(item.openDt || ""),
        audiAcc: 0,
        scrnCnt: 0,
        showCnt: 0,
        prdtStatNm: "개봉예정",
      }));

    // TMDB 포스터 + 백드롭 보완
    const tmdbPromises = upcoming.map((m: BoxOfficeMovie) =>
      fetchTmdbInfo(m.movieNm, m.movieNmEn, m.openDt),
    );
    const tmdbResults = await Promise.all(tmdbPromises);
    upcoming.forEach((m, i) => {
      m.posterUrl = tmdbResults[i].posterUrl;
      m.backdropUrl = tmdbResults[i].backdropUrl;
      m.overview = tmdbResults[i].overview;
    });

    return upcoming;
  } catch {
    return [];
  }
}

/**
 * 메가박스 실제 상영목록 중 KOFIC에 없는 영화를 보완.
 * KOFIC 박스오피스가 하루 늦게 발표되거나 신작이 미등록인 경우,
 * 실제 극장에서 상영 중인 영화를 누락 보완한다.
 * koficMovies: 박스오피스 + upcoming 합쳐서 비교 기준.
 */
export async function getMegaSupplementMovies(
  koficMovies: BoxOfficeMovie[],
): Promise<BoxOfficeMovie[]> {
  try {
    const megaMovies = await getMegaMovies();
    const knownTitles = new Set(
      koficMovies.map((m) => normalizeTitleForMatch(m.movieNm)),
    );

    // KOFIC에 없는 메가박스 상영작만 추출
    const missing = megaMovies.filter(
      (m) => !knownTitles.has(normalizeTitleForMatch(m.title)),
    );
    if (missing.length === 0) return [];

    const result: BoxOfficeMovie[] = missing.map((m) => ({
      movieCd: `mega-${m.id}`,
      movieNm: m.title,
      rank: 999,
      openDt: "",
      audiAcc: 0,
      scrnCnt: 0,
      showCnt: 0,
      rating: m.rating,
    }));

    // TMDB 포스터 + 백드롭 보완
    const tmdbPromises = result.map((m) =>
      fetchTmdbInfo(m.movieNm, undefined, undefined),
    );
    const tmdbResults = await Promise.all(tmdbPromises);
    result.forEach((m, i) => {
      m.posterUrl = tmdbResults[i].posterUrl;
      m.backdropUrl = tmdbResults[i].backdropUrl;
      m.overview = tmdbResults[i].overview;
    });

    return result;
  } catch {
    return [];
  }
}
