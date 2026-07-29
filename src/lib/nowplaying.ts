/**
 * 현재 상영작 통합 조회 모듈.
 * 세 체인(Megabox/Lotte/CGV)의 실제 상영목록을 합집합으로 모으고,
 * 각 영화를 KOFIC movieCd에 매핑한 뒤 메타데이터를 보완한다.
 * KOFIC 박스오피스는 순위/누적관객수 보완용으로만 사용한다.
 */

import { getMegaMovies } from "../crawler/megabox";
import { getLottePlayingMovies } from "../crawler/lotte";
import { getCgvPlayingMovies } from "../crawler/cgv";
import { fetchWithRetry } from "./fetchWithRetry";
import { memoizeTTL } from "./memoizeTTL";
import {
  type BoxOfficeMovie,
  getMovieByCode,
  searchMovieByTitle,
} from "./kofic";
import { kstMidnight } from "../crawler/dates";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}가 설정되어 있지 않습니다.`);
  return value;
}

function getKoficKey(): string {
  return process.env.KOFIC_KEY || requireEnv("KOFIC_KEY");
}

function normalizeTitleForMatch(title: string): string {
  return title
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

// KOFIC 일별 박스오피스에서 rank/audiAcc만 추출 (캐시 1시간)
const BO_META_TTL = 60 * 60 * 1000;
const BO_META_KEY = "kofic:boxOfficeMeta";

interface BoxOfficeMeta {
  movieCd: string;
  rank: number;
  audiAcc: number;
}

async function fetchBoxOfficeMeta(): Promise<Map<string, BoxOfficeMeta>> {
  return memoizeTTL(BO_META_KEY, BO_META_TTL, async () => {
    const dates = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const dd = new Date();
      dd.setUTCHours(dd.getUTCHours() - 9);
      dd.setUTCDate(dd.getUTCDate() - d);
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dd).replaceAll("-", "");
    });

    const allItems = await Promise.all(
      dates.map(async (dt) => {
        const url = `https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json?key=${getKoficKey()}&targetDt=${dt}`;
        const res = await fetchWithRetry(url, {}, { timeoutMs: 8000, retries: 1 });
        const data = await res.json();
        return data?.boxOfficeResult?.dailyBoxOfficeList || [];
      }),
    );

    const map = new Map<string, BoxOfficeMeta>();
    for (const items of allItems) {
      for (const item of items) {
        const cd = item.movieCd as string;
        if (!map.has(cd)) {
          map.set(cd, {
            movieCd: cd,
            rank: parseInt(item.rank, 10),
            audiAcc: parseInt(item.audiAcc, 10) || 0,
          });
        }
      }
    }
    return map;
  });
}

// KOFIC 박스오피스 movieCd 집합을 "현재 상영" 진실 소스로 사용.
// 박스오피스는 하루 지연 발표이므로, 오늘/어제 개봉작은 미등록이어도 통과.
function isActuallyPlaying(
  movieCd: string,
  openDt: string,
  boMeta: Map<string, BoxOfficeMeta>,
): boolean {
  if (boMeta.has(movieCd)) return true;
  // 박스오피스에 없더라도 개봉일이 최근 3일 이내면 신작으로 간주
  if (openDt) {
    const ts = kstMidnight(openDt);
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    if (ts >= threeDaysAgo) return true;
  }
  return false;
}

// 제목 → movieCd 발굴 캐시 (24시간 — 제목별 첫 발굴 후 재사용)
const titleToCodeCache = new Map<string, { ts: number; cd: string | null }>();
const TITLE_CD_TTL = 24 * 60 * 60 * 1000;

async function resolveMovieCd(title: string): Promise<string | null> {
  const key = normalizeTitleForMatch(title);
  const cached = titleToCodeCache.get(key);
  if (cached && Date.now() - cached.ts < TITLE_CD_TTL) return cached.cd;

  const cd = await searchMovieByTitle(title);
  titleToCodeCache.set(key, { ts: Date.now(), cd });
  return cd;
}

const NOW_PLAYING_TTL = 60 * 60 * 1000;
const NOW_PLAYING_KEY = "nowplaying:all";

export interface NowPlayingMovie {
  movieCd: string;
  movieNm: string;
  rank: number;
  openDt: string;
  audiAcc: number;
  rating?: string;
  runtimeMin?: number;
  genres?: string[];
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  chains: string[];
}

/**
 * 삼체인 실제 상영작 합집합을 KOFIC movieCd 기반으로 통합.
 * - 각 체인 상영목록에서 제목 수집 → 중복 제거
 * - 제목 → KOFIC movieCd 발굴 (searchMovieByTitle)
 * - movieCd로 KOFIC 상세정보 + TMDB 포스터/줄거리 보완
 * - KOFIC 박스오피스에서 rank/audiAcc best-effort 매핑
 */
export async function getNowPlayingMovies(): Promise<NowPlayingMovie[]> {
  return memoizeTTL(NOW_PLAYING_KEY, NOW_PLAYING_TTL, async () => {
    // 각 체인 목록을 독립적으로 호출 — 하나 실패해도 다른 체인으로 동작
    const [megaR, lotteR, cgvR] = await Promise.allSettled([
      getMegaMovies(),
      getLottePlayingMovies(),
      getCgvPlayingMovies(),
    ]);
    const mega = megaR.status === "fulfilled" ? megaR.value : [];
    const lotte = lotteR.status === "fulfilled" ? lotteR.value : [];
    const cgv = cgvR.status === "fulfilled" ? cgvR.value : [];

    // 제목 → chains 추적 (어느 체인에서 상영하는지)
    const titleMap = new Map<string, { title: string; chains: Set<string> }>();

    for (const m of mega) {
      const key = normalizeTitleForMatch(m.title);
      if (!titleMap.has(key)) titleMap.set(key, { title: m.title, chains: new Set() });
      titleMap.get(key)!.chains.add("MEGABOX");
    }
    for (const m of lotte) {
      const key = normalizeTitleForMatch(m.title);
      if (!titleMap.has(key)) titleMap.set(key, { title: m.title, chains: new Set() });
      titleMap.get(key)!.chains.add("LOTTE");
    }
    for (const m of cgv) {
      const key = normalizeTitleForMatch(m.title);
      if (!titleMap.has(key)) titleMap.set(key, { title: m.title, chains: new Set() });
      titleMap.get(key)!.chains.add("CGV");
    }

    // 박스오피스 메타 (rank/audiAcc)
    const boMeta = await fetchBoxOfficeMeta();

    // 각 제목 → movieCd 발굴 (병렬)
    const entries = [...titleMap.values()];
    const cdResults = await Promise.all(
      entries.map((e) => resolveMovieCd(e.title).catch(() => null)),
    );

    // movieCd → 상세정보 + TMDB (getMovieByCode가 둘 다 처리)
    const moviesWithCd = entries
      .map((entry, i) => ({ entry, cd: cdResults[i] }))
      .filter((x): x is { entry: typeof x.entry; cd: string } => x.cd !== null);

    const detailResults = await Promise.all(
      moviesWithCd.map((x) => getMovieByCode(x.cd).catch(() => null)),
    );

    const result: NowPlayingMovie[] = [];
    for (let i = 0; i < moviesWithCd.length; i++) {
      const { entry, cd } = moviesWithCd[i];
      const detail = detailResults[i];
      if (!detail) continue;

      // 상영 종료작 제거: KOFIC 박스오피스(최근 7일)에 없고,
      // 개봉일도 3일 이상 지난 영화는 더 이상 상영하지 않는 것으로 간주.
      // (롯데 Movies 목록에 종료작이 잔류하는 문제 해결)
      if (!isActuallyPlaying(cd, detail.openDt, boMeta)) continue;

      const bo = boMeta.get(cd);
      result.push({
        movieCd: cd,
        movieNm: detail.movieNm,
        rank: bo?.rank ?? 999,
        openDt: detail.openDt,
        audiAcc: bo?.audiAcc ?? 0,
        rating: detail.rating,
        runtimeMin: detail.runtimeMin,
        genres: detail.genres,
        posterUrl: detail.posterUrl,
        backdropUrl: detail.backdropUrl,
        overview: detail.overview,
        chains: [...entry.chains].sort(),
      });
    }

    // 순위순 정렬 (박스오피스 미등록은 999 → 후순위)
    result.sort((a, b) => a.rank - b.rank);
    return result;
  });
}

/** KOFIC 개봉예정작 (미래 openDt만). 삼체인 화이트리스트 불필요. */
export async function getUpcomingOnlyMovies(): Promise<NowPlayingMovie[]> {
  try {
    const url = `https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json?key=${getKoficKey()}&openStartDt=${new Date().getFullYear()}&itemPerPage=100`;
    const res = await fetchWithRetry(url, {}, { timeoutMs: 8000, retries: 2 });
    const data = await res.json();
    const items = data?.movieListResult?.movieList || [];

    const now = Date.now();
    const twoWeeksLater = now + 14 * 24 * 60 * 60 * 1000;

    const upcoming: NowPlayingMovie[] = items
      .filter((item: { openDt?: string }) => {
        if (!item.openDt) return false;
        const ts = kstMidnight(normalizeDate(item.openDt));
        return ts > now && ts <= twoWeeksLater;
      })
      .map((item: { movieCd: string; movieNm: string; movieNmEn?: string; openDt?: string }) => ({
        movieCd: item.movieCd,
        movieNm: item.movieNm,
        rank: 999,
        openDt: normalizeDate(item.openDt || ""),
        audiAcc: 0,
        chains: [],
      }));

    // TMDB 포스터 보완 (getMovieByCode가 TMDB도 처리)
    const details = await Promise.all(
      upcoming.map((m) => getMovieByCode(m.movieCd).catch(() => null)),
    );
    upcoming.forEach((m, i) => {
      const d = details[i];
      if (d) {
        m.posterUrl = d.posterUrl;
        m.backdropUrl = d.backdropUrl;
        m.overview = d.overview;
        m.rating = d.rating;
        m.runtimeMin = d.runtimeMin;
        m.genres = d.genres;
      }
    });

    return upcoming;
  } catch {
    return [];
  }
}

function normalizeDate(openDt: string): string {
  if (openDt.length === 8) {
    return `${openDt.slice(0, 4)}-${openDt.slice(4, 6)}-${openDt.slice(6, 8)}`;
  }
  return openDt;
}

export type { BoxOfficeMovie };