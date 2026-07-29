import got from "got";
import type { CrawledShowtime, Theater, TheaterChain } from "../lib/types";
import { dateCompact } from "./dates";

const CHAIN: TheaterChain = "CGV";
const CGV_API = "https://cgv.co.kr/api/v1/booking";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://cgv.co.kr/booking",
  Origin: "https://cgv.co.kr",
  "Sec-Ch-Ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": "\"macOS\"",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

interface CgvTheater {
  coCd: string;
  siteNo: string;
  siteNm: string;
  regnGrpNm: string;
  bzplcNo: string;
}
interface CgvResponse {
  statusCode: number;
  statusMessage: string;
  data: CgvTheater[];
}

interface CgvShowtime {
  siteNm: string;
  scnsNm: string;
  scnsGradNm: string;
  expoProdNm: string;
  movNo: string;
  movNm: string;
  movkndCd: string;
  movkndDsplNm: string;
  scnsrtTm: string;
  scnendTm: string;
  stcnt: string;
  frSeatCnt: string;
  salsTznNm: string;
  prodNm: string;
  tcscnsGradCd: string;
  tcscnsGradNm: string;
  sbtdivNm: string;
}

let cgvTheaterCache: { ts: number; data: Theater[] } | null = null;
const CGV_TTL = 10 * 60 * 1000;

function mapCgvRegion(regionName: string): string | null {
  if (regionName.includes("서울")) return "seoul";
  if (regionName.includes("경기")) return "gyeonggi";
  if (regionName.includes("인천")) return "incheon";
  if (regionName.includes("대전") || regionName.includes("충청") || regionName.includes("세종")) return "chungcheong";
  if (regionName.includes("부산") || regionName.includes("대구") || regionName.includes("경상") || regionName.includes("울산")) return "gyeongsang";
  if (regionName.includes("광주") || regionName.includes("전라")) return "jeolla";
  if (regionName.includes("강원")) return "gangwon";
  if (regionName.includes("제주")) return "jeju";
  return null;
}

async function fetchCgvApi(path: string): Promise<Record<string, unknown>> {
  const url = `${CGV_API}${path}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await got(url, {
        method: "GET",
        headers: BROWSER_HEADERS,
        timeout: { request: 15000 },
        responseType: "json",
      });

      if (res.statusCode === 403) {
        const bodyText = typeof res.body === "string" ? res.body : "";
        if (bodyText.includes("비정상적으로 CGV에 접속")) {
          throw new Error("CGV_CLOUDFLARE");
        }
      }

      const json = res.body as Record<string, unknown>;
      if (json.statusCode !== 0) {
        throw new Error(`CGV API error: ${json.statusMessage}`);
      }
      return json;
    } catch (e) {
      if (e instanceof Error && e.message === "CGV_CLOUDFLARE" && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("CGV API 재시도 실패");
}

export async function getCgvTheaters(): Promise<Theater[]> {
  if (cgvTheaterCache && Date.now() - cgvTheaterCache.ts < CGV_TTL) {
    return cgvTheaterCache.data;
  }

  const response = await fetchCgvApi("/searchRegnList?coCd=A420") as unknown as CgvResponse;
  const theaters: Theater[] = [];
  let id = 1;
  for (const region of response.data || []) {
    const regionId = mapCgvRegion(region.regnGrpNm);
    if (!regionId) continue;
    for (const site of (region as { siteList?: CgvTheater[] }).siteList || []) {
      theaters.push({
        id: `cgv-${site.siteNo}-${id++}`,
        name: `CGV ${site.siteNm}`,
        chain: CHAIN,
        regionId,
        address: `${region.regnGrpNm} ${site.siteNm}`,
        chainTheaterId: site.siteNo,
      });
    }
  }
  cgvTheaterCache = { ts: Date.now(), data: theaters };
  return theaters;
}

function formatTime(tm: string): string {
  if (!tm || tm.length < 4) return "--:--";
  const h = tm.slice(0, 2);
  const m = tm.slice(2, 4);
  return `${h}:${m}`;
}

function normalizeCgvScreen(showtime: CgvShowtime): string {
  const parts: string[] = [showtime.movkndDsplNm || showtime.movkndCd];
  if (showtime.sbtdivNm && showtime.sbtdivNm !== "null") parts.push(showtime.sbtdivNm);
  const scns = showtime.scnsNm || "";
  if (scns.includes("SCREENX") && !parts.some((p) => p.includes("SCREENX"))) parts.push("ScreenX");
  if (scns.includes("IMAX") && !parts.some((p) => p.includes("IMAX"))) parts.push("IMAX");
  if (scns.includes("4DX") && !parts.some((p) => p.includes("4DX"))) parts.push("4DX");
  if (scns.includes("Dolby") && !parts.some((p) => p.includes("Dolby"))) parts.push("Dolby Cinema");
  if (scns.includes("Laser") && !parts.some((p) => p.includes("Laser"))) parts.push("Laser");
  if (scns.includes("리클라이너") && !parts.some((p) => p.includes("리클라이너"))) parts.push("Recliner");
  if (showtime.tcscnsGradNm && showtime.tcscnsGradNm !== "일반") {
    const extras = [showtime.tcscnsGradNm];
    if (showtime.scnsNm) {
      if (showtime.scnsNm.includes("SCREENX") && !extras.includes("ScreenX")) extras.push("ScreenX");
      if (showtime.scnsNm.includes("리클라이너") && !extras.includes("Recliner")) extras.push("Recliner");
      if (showtime.scnsNm.includes("Laser") && !extras.includes("Laser")) extras.push("Laser");
    }
    parts.splice(1, 0, ...extras.slice(0, 3));
  }
  return parts.join(" · ");
}

function normalizeMovieTitle(title: string): string {
  return title
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

export async function crawlCgv(
  siteNo: string,
  theaterName: string,
  date = new Date(),
  movieTitle?: string,
): Promise<CrawledShowtime[]> {
  const ymd = dateCompact(date);
  const response = await fetchCgvApi(
    `/searchMovScnInfo?coCd=A420&siteNo=${siteNo}&scnYmd=${ymd}&rtctlScopCd=01`,
  );
  const showtimes = (response.data || []) as CgvShowtime[];
  const selectedTitle = movieTitle ? normalizeMovieTitle(movieTitle) : "";
  const filtered = showtimes.filter((s) => {
    if (!s.expoProdNm && !s.movNm) return false;
    if (!selectedTitle) return true;
    const title = normalizeMovieTitle(s.expoProdNm || s.movNm || s.prodNm);
    return title === selectedTitle || title.includes(selectedTitle) || selectedTitle.includes(title);
  });
  return filtered.map((s, i): CrawledShowtime => ({
    id: `${CHAIN}-${siteNo}-${ymd}-${i}`,
    chain: CHAIN,
    chainTheaterId: siteNo,
    chainTheaterName: s.siteNm || theaterName,
    chainMovieId: s.movNo || "",
    movieTitle: s.expoProdNm || s.movNm || s.prodNm,
    screenName: s.scnsNm,
    screenType: normalizeCgvScreen(s),
    startTime: formatTime(s.scnsrtTm),
    endTime: formatTime(s.scnendTm),
    totalSeats: parseInt(s.stcnt, 10) || 0,
    remainingSeats: parseInt(s.frSeatCnt, 10) || 0,
  }));
}

// 강남 대표점(0056) 상영시간표에서 현재 CGV 상영작 제목 추출.
// CGV는 전체 상영작 목록 API가 없어서 대표점 1곳의 상영시간표를 활용한다.
let cgvPlayingCache: { ts: number; data: { id: string; title: string }[] } | null = null;
const CGV_PLAYING_TTL = 5 * 60 * 1000;

export async function getCgvPlayingMovies(): Promise<{ id: string; title: string }[]> {
  if (cgvPlayingCache && Date.now() - cgvPlayingCache.ts < CGV_PLAYING_TTL) {
    return cgvPlayingCache.data;
  }
  const ymd = dateCompact();
  const response = await fetchCgvApi(
    `/searchMovScnInfo?coCd=A420&siteNo=0056&scnYmd=${ymd}&rtctlScopCd=01`,
  );
  const showtimes = (response.data || []) as CgvShowtime[];
  const seen = new Set<string>();
  const movies: { id: string; title: string }[] = [];
  for (const s of showtimes) {
    const title = (s.expoProdNm || s.movNm || s.prodNm || "").trim();
    if (!title) continue;
    const key = normalizeMovieTitle(title);
    if (seen.has(key)) continue;
    seen.add(key);
    movies.push({ id: s.movNo || key, title });
  }
  cgvPlayingCache = { ts: Date.now(), data: movies };
  return movies;
}