import type { CrawledShowtime, Theater, TheaterChain } from "../lib/types";
import { dateCompact } from "./dates";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { memoizeTTL } from "../lib/memoizeTTL";

const CHAIN: TheaterChain = "MEGABOX";
const API =
  "https://www.megabox.co.kr/on/oh/ohb/SimpleBooking/selectBokdList.do";

interface MegaShow {
  brchNo: string;
  brchNm: string;
  playStartTime: string;
  playEndTime: string;
  theabExpoNm: string;
  theabKindCd: string;
  playKindNm: string;
  movieNm: string;
  movieNo: string;
  rpstMovieNo: string;
  restSeatCnt: number;
  totSeatCnt: number;
}

interface MegaResponse {
  movieFormList?: MegaShow[];
  areaBrchList?: {
    areaCdNm: string;
    brchNo: string;
    brchNm: string;
    brchFormAt?: string;
    brchBokdUnableAt?: string;
  }[];
  movieList?: {
    movieNo: string;
    movieNm: string;
    admisClassCdNm: string;
    boxoRank: number;
    movieImgPath?: string;
    playTime?: string;
  }[];
}

// 메가박스 상영 중인 영화 목록 (전국 공통, 캐싱)
let megaMoviesCache: {
  ts: number;
  data: { id: string; title: string; posterUrl?: string; rating?: string; rank?: number }[];
} | null = null;
const MEGA_TTL = 5 * 60 * 1000;
let megaTheatersCache: { ts: number; data: Theater[] } | null = null;

function mapMegaRegion(areaName: string): string | null {
  if (areaName.includes("서울")) return "seoul";
  if (areaName.includes("인천")) return "incheon";
  if (areaName.includes("경기")) return "gyeonggi";
  if (/대전|충청|세종/.test(areaName)) return "chungcheong";
  if (/부산|대구|경상|경북|경남|울산/.test(areaName)) return "gyeongsang";
  if (/광주|전라|전북|전남/.test(areaName)) return "jeolla";
  if (areaName.includes("강원")) return "gangwon";
  if (areaName.includes("제주")) return "jeju";
  return null;
}

async function fetchMegaBaseData(): Promise<MegaResponse> {
  return memoizeTTL("megabox:baseData", MEGA_TTL, () =>
    fetchMegaData("", dateCompact()),
  );
}

async function fetchMegaData(brchNo: string, playDe: string): Promise<MegaResponse> {
  const form = new URLSearchParams();
  form.append("brchNo1", brchNo);
  form.append("playDe", playDe);
  form.append("movieNo1", "");
  form.append("sellChnlCd", "");
  const res = await fetchWithRetry(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://www.megabox.co.kr/booking",
    },
    body: form.toString(),
  }, { timeoutMs: 10_000, retries: 1, baseDelayMs: 1500 });
  if (!res.ok) throw new Error(`Megabox HTTP ${res.status}`);
  return await res.json() as MegaResponse;
}

export async function getMegaTheaters(): Promise<Theater[]> {
  if (megaTheatersCache && Date.now() - megaTheatersCache.ts < MEGA_TTL) {
    return megaTheatersCache.data;
  }
  const data = await fetchMegaBaseData();
  const unique = new Map<string, Theater>();
  for (const branch of data.areaBrchList || []) {
    const regionId = mapMegaRegion(branch.areaCdNm || "");
    if (!regionId || branch.brchFormAt === "N") continue;
    unique.set(branch.brchNo, {
      id: `megabox-${branch.brchNo}`,
      name: `메가박스 ${decodeMovieNm(branch.brchNm)}`,
      chain: "MEGABOX",
      regionId,
      address: branch.areaCdNm,
      chainTheaterId: branch.brchNo,
    });
  }
  const result = [...unique.values()];
  megaTheatersCache = { ts: Date.now(), data: result };
  return result;
}

/** 메가박스 전체 영화 목록 (UI 영화 선택용) */
export async function getMegaMovies(): Promise<{
  id: string;
  title: string;
  posterUrl?: string;
  rating?: string;
  rank?: number;
}[]> {
  if (megaMoviesCache && Date.now() - megaMoviesCache.ts < MEGA_TTL) {
    return megaMoviesCache.data;
  }
  const json = await fetchMegaBaseData();
  const movies = json.movieList || [];
    const result = movies.map((m) => ({
      id: m.movieNo,
      title: m.movieNm,
      posterUrl: m.movieImgPath
        ? `https://img.megabox.co.kr${m.movieImgPath}`
        : undefined,
      rating: m.admisClassCdNm,
      rank: m.boxoRank,
    }));
  megaMoviesCache = { ts: Date.now(), data: result };
  return result;
}

export async function crawlMegabox(
  brchNo: string,
  theaterName: string,
  date = new Date(),
  movieTitle?: string,
): Promise<CrawledShowtime[]> {
  const json = await fetchMegaData(brchNo, dateCompact(date));
  const shows = json.movieFormList || [];
    const selectedTitle = movieTitle ? normalizeMovieTitle(movieTitle) : "";
    return shows
      .filter((s) => {
        if (s.brchNo !== brchNo) return false;
        if (!selectedTitle) return true;
        const title = normalizeMovieTitle(decodeMovieNm(s.movieNm));
        return title === selectedTitle || title.includes(selectedTitle) || selectedTitle.includes(title);
      })
      .map((s, i) => ({
        id: `${CHAIN}-${brchNo}-${i}`,
        chain: CHAIN,
        chainTheaterId: brchNo,
        chainTheaterName: s.brchNm ? decodeMovieNm(s.brchNm) : theaterName,
        chainMovieId: s.rpstMovieNo || s.movieNo,
        movieTitle: decodeMovieNm(s.movieNm),
        screenName: s.theabExpoNm,
        screenType: normalizeScreenType(s.playKindNm, s.theabKindCd),
        startTime: s.playStartTime,
        endTime: s.playEndTime,
        totalSeats: s.totSeatCnt,
        remainingSeats: s.restSeatCnt,
      }));
}

function normalizeMovieTitle(title: string): string {
  return title
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

function decodeMovieNm(s: string): string {
  return s.replace(/&#40;/g, "(").replace(/&#41;/g, ")").replace(/&amp;/g, "&").trim();
}

function normalizeScreenType(playKindNm: string, theabKindCd: string): string {
  const k = (theabKindCd || "").toUpperCase();
  const p = (playKindNm || "").toUpperCase();
  const baseFormat = p.includes("3D") ? "3D" : "2D";
  if (k.includes("IMX")) return "IMAX";
  if (k.includes("DX") || k.includes("4D")) return "4DX";
  if (k.includes("DBY")) return "Dolby Cinema";
  if (k.includes("SCX")) return "ScreenX";
  if (k.includes("RCL")) return "Recliner";
  if (k.includes("SUX")) return `${baseFormat} · SOUNDX`;
  return baseFormat;
}
