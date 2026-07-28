import type { Theater } from "../lib/types";
import { getMegaTheaters } from "./megabox";
import { getLotteTheaters } from "./lotte";
import { getCgvTheaters } from "./cgv";

let theaterCache: { ts: number; data: Theater[] } | null = null;
const THEATER_TTL = 10 * 60 * 1000;

export async function getAllTheaters(): Promise<Theater[]> {
  if (theaterCache && Date.now() - theaterCache.ts < THEATER_TTL) {
    return theaterCache.data;
  }

  const [cgv, megabox, lotte] = await Promise.all([
    getCgvTheaters().catch((error) => {
      console.error("[theaters] CGV 목록 실패:", error instanceof Error ? error.message : error);
      return [] as Theater[];
    }),
    getMegaTheaters().catch((error) => {
      console.error("[theaters] 메가박스 목록 실패:", error instanceof Error ? error.message : error);
      return [] as Theater[];
    }),
    getLotteTheaters().catch((error) => {
      console.error("[theaters] 롯데 목록 실패:", error instanceof Error ? error.message : error);
      return [] as Theater[];
    }),
  ]);
  const data = [...cgv, ...megabox, ...lotte];
  theaterCache = { ts: Date.now(), data };
  return data;
}

export async function getTheatersByRegion(regionId: string): Promise<Theater[]> {
  const theaters = await getAllTheaters();
  return theaters.filter((theater) => theater.regionId === regionId);
}
