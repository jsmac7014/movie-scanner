import type { CrawledShowtime, Theater, TheaterChain } from "../lib/types";
import { dateIso, kstMidnight } from "./dates";
import { fetchWithRetry } from "../lib/fetchWithRetry";

const CHAIN: TheaterChain = "LOTTE";
const API = "https://www.lottecinema.co.kr/LCWS/Ticketing/TicketingData.aspx";

interface LotteCinema {
  CinemaID: number;
  CinemaNameKR: string;
  DivisionCode: number;
  DetailDivisionCode: string;
  CinemaAddrSummary?: string;
}
interface LotteMovie {
  RepresentationMovieCode: string;
  MovieNameKR: string;
  BookingYN?: string;
  MoviePlayYN?: string;
  ReleaseDate?: string;
  PosterURL?: string;
  ViewGradeNameKR?: string;
}
interface LottePlaySeq {
  ScreenNameKR?: string;
  ScreenDivisionNameKR?: string;
  ScreenDivisionCode?: string | number;
  BrandNm_KR?: string;
  FilmNameKR?: string;
  StartTime?: string;
  EndTime?: string;
  TotalSeatCount?: number;
  BookingSeatCount?: number;
  MovieNameKR?: string;
}
interface LotteResponse {
  IsOK: string | boolean;
  ResultMessage?: string;
  Cinemas?: { Cinemas?: { Items: LotteCinema[] } };
  Movies?: { Movies?: { Items: LotteMovie[] } };
  PlaySeqs?: { Items?: LottePlaySeq[] } | LottePlaySeq[] | null;
}

// GetTicketingPageTOBE 응답 캐싱 (모든 롯데 극장이 공유, 5분)
interface LottePageData {
  movies: LotteMovie[];
  cinemas: LotteCinema[];
  playDates: { PlayDate: string; IsPlayDate: string }[];
}
let lottePageCache: { ts: number; data: LottePageData } | null = null;
const LOTTE_TTL = 5 * 60 * 1000;

let lottePagePromise: Promise<LottePageData> | null = null;

/** 모든 롯데 극장이 공유하는 영화/극장 목록을 미리 로드 (한 번만 호출) */
export async function getLottePageData(): Promise<LottePageData> {
  if (lottePageCache && Date.now() - lottePageCache.ts < LOTTE_TTL) {
    return lottePageCache.data;
  }
  if (lottePagePromise) return lottePagePromise;

  lottePagePromise = (async () => {
    try {
      const r = await callLcws<LotteResponse>({
        MethodName: "GetTicketingPageTOBE",
        channelType: "HO",
        osType: "W",
        osVersion: "Mozilla/5.0",
        memberOnNo: "0",
      });

      const movies: LotteMovie[] = r.Movies?.Movies?.Items || [];
      const cinemas: LotteCinema[] = r.Cinemas?.Cinemas?.Items || [];
      type PlayDateItem = { PlayDate: string; IsPlayDate: string };
      const datesObj = (r as { MoviePlayDates?: { Items?: PlayDateItem[] | { Items?: PlayDateItem[] } } }).MoviePlayDates;
      const rawDates = datesObj?.Items;
      const playDates: PlayDateItem[] = Array.isArray(rawDates)
        ? rawDates
        : (rawDates as { Items?: PlayDateItem[] })?.Items || [];

      const data: LottePageData = { movies, cinemas, playDates };
      lottePageCache = { ts: Date.now(), data };
      return data;
    } finally {
      lottePagePromise = null;
    }
  })();
  return lottePagePromise;
}

/** 상영 중인 영화(개봉작)만 필터링 */
function filterPlaying(movies: LotteMovie[]): LotteMovie[] {
  const now = Date.now();
  return movies.filter((m) => {
    if (m.ReleaseDate) {
      const dateStr = m.ReleaseDate.split(" ")[0];
      const ts = kstMidnight(dateStr);
      if (!isNaN(ts)) {
        return ts <= now;
      }
    }
    return true;
  });
}

/** 롯데의 상영 중인 영화 목록 반환 (UI 영화 선택용) */
export async function getLottePlayingMovies(): Promise<{
  id: string;
  title: string;
  posterUrl?: string;
  rating?: string;
  releaseDate?: string;
}[]> {
  const { movies } = await getLottePageData();
  return filterPlaying(movies).map((m) => ({
    id: m.RepresentationMovieCode,
    title: m.MovieNameKR,
    posterUrl: m.PosterURL,
    rating: m.ViewGradeNameKR,
    releaseDate: m.ReleaseDate?.split(" ")[0],
  }));
}

function mapLotteRegion(cinema: LotteCinema): string | null {
  const areaCode = cinema.DetailDivisionCode;
  if (areaCode === "0001") return "seoul";
  if (areaCode === "0002") {
    return /인천|부평|송도|청라|검단|영종|계양|주안|구월|논현|라피에스타/.test(
      `${cinema.CinemaNameKR} ${cinema.CinemaAddrSummary || ""}`,
    )
      ? "incheon"
      : "gyeonggi";
  }
  if (areaCode === "0003") return "chungcheong";
  if (areaCode === "0004") return "jeolla";
  if (areaCode === "0005" || areaCode === "0101") return "gyeongsang";
  if (areaCode === "0006") return "gangwon";
  if (areaCode === "0007") return "jeju";
  return null;
}

export async function getLotteTheaters(): Promise<Theater[]> {
  const { cinemas } = await getLottePageData();
  return cinemas.flatMap((cinema) => {
    const regionId = mapLotteRegion(cinema);
    if (!regionId) return [];
    return [{
      id: `lotte-${cinema.CinemaID}`,
      name: `롯데시네마 ${cinema.CinemaNameKR}`,
      chain: "LOTTE" as const,
      regionId,
      address: cinema.CinemaAddrSummary || "",
      chainTheaterId: String(cinema.CinemaID),
    }];
  });
}

function normalizeMovieTitle(title: string): string {
  return title
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

export async function crawlLotte(
  cinemaID: string,
  theaterName: string,
  date = new Date(),
  movieTitle?: string,
): Promise<CrawledShowtime[]> {
  const { movies: allMovies, cinemas } = await getLottePageData();

  const cinemaObj = cinemas.find((c) => String(c.CinemaID) === cinemaID);
  if (!cinemaObj) return [];
  const compositeCinemaId = `${cinemaObj.DivisionCode}|${cinemaObj.DetailDivisionCode}|${cinemaObj.CinemaID}`;

  const validDate = dateIso(date);

  const selectedTitle = movieTitle ? normalizeMovieTitle(movieTitle) : "";
  const playingMovies = selectedTitle
    ? allMovies.filter((movie) => {
        const title = normalizeMovieTitle(movie.MovieNameKR);
        return title === selectedTitle || title.includes(selectedTitle) || selectedTitle.includes(title);
      })
    : filterPlaying(allMovies);
  // 선택 영화가 있으면 극장당 API 1회만 호출한다.
  const results = await Promise.all(
    playingMovies.map(async (m) => {
      try {
        const r = await callLcws<LotteResponse>({
          MethodName: "GetPlaySequence",
          channelType: "HO",
          osType: "W",
          osVersion: "Mozilla/5.0",
          playDate: validDate,
          cinemaID: compositeCinemaId,
          representationMovieCode: String(m.RepresentationMovieCode),
        });
        if (r.IsOK !== "true" && r.IsOK !== true) {
          console.error(`[crawler] LOTTE ${theaterName} 실패: ${r.ResultMessage || "unknown response"}`);
          return [];
        }
        const seqs: LottePlaySeq[] =
          (r.PlaySeqs as { Items?: LottePlaySeq[] })?.Items ||
          (Array.isArray(r.PlaySeqs) ? (r.PlaySeqs as LottePlaySeq[]) : []);
        return seqs.map((s, idx) => ({
          id: `${CHAIN}-${cinemaID}-${m.RepresentationMovieCode}-${idx}`,
          chain: CHAIN,
          chainTheaterId: cinemaID,
          chainTheaterName: theaterName,
          chainMovieId: m.RepresentationMovieCode,
          movieTitle: s.MovieNameKR || m.MovieNameKR,
          screenName: s.ScreenNameKR || "상영관",
          screenType: normalizeScreen(
            s.ScreenDivisionNameKR,
            s.ScreenDivisionCode,
            s.FilmNameKR,
            s.BrandNm_KR,
          ),
          startTime: (s.StartTime || "").slice(0, 5),
          endTime: (s.EndTime || "").slice(0, 5),
          totalSeats: s.TotalSeatCount || 0,
          remainingSeats: s.BookingSeatCount || 0,
        }));
      } catch (error) {
        console.error(
          `[crawler] LOTTE ${theaterName} 실패:`,
          error instanceof Error ? error.message : error,
        );
        return [];
      }
    }),
  );
  const out: CrawledShowtime[] = [];
  for (const result of results) out.push(...result);
  return out;
}

async function callLcws<T>(
  params: Record<string, unknown>,
): Promise<T> {
  const form = new FormData();
  form.append("paramList", JSON.stringify(params));
  const res = await fetchWithRetry(API, {
    method: "POST",
    body: form,
    headers: {
      Referer: "https://www.lottecinema.co.kr/NLCHS/Booking",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
  }, { timeoutMs: 10_000, retries: 2 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as T;
}

function normalizeScreen(
  name?: string,
  code?: string | number,
  film?: string,
  brand?: string,
): string {
  const n = (name || "").toString().toUpperCase();
  const c = (code != null ? code.toString() : "").toUpperCase();
  const b = (brand || "").toString().toUpperCase();
  const baseFormat = (film || "").toUpperCase().includes("3D") ? "3D" : "2D";
  if (n.includes("IMAX") || c.includes("IMX")) return "IMAX";
  if (n.includes("4DX") || c.includes("4D")) return "4DX";
  if (n.includes("DOLBY") || c.includes("DBY")) return "Dolby Cinema";
  if (n.includes("SCREENX") || c.includes("SCX")) return "ScreenX";
  if (n.includes("수퍼LED")) return `${baseFormat} · 수퍼LED(일반)`;
  if (n.includes("수퍼플렉스")) {
    return `${baseFormat} · 수퍼플렉스${b.includes("LASER") ? " LASER" : ""}`;
  }
  if (n.includes("RECLINER") || c.includes("RCL")) return "Recliner";
  if (n.includes("샤롯데") || n.includes("CHARLOTTE")) return "CharLotte";
  if (n.includes("광음") || n.includes("LEDA")) return "LED";
  return baseFormat;
}
