import type { TheaterChain } from "./types";
import { todayKst, kstMidnight } from "../crawler/dates";

export interface ApiMovie {
  id: string;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  rating?: string;
  releaseDate?: string;
  chains?: string[];
  rank?: number;
  isUpcoming?: boolean;
  runtimeMin?: number;
  genres?: string[];
  audiAcc?: number;
}

export interface Region {
  id: string;
  name: string;
}

export interface TheaterInfo {
  id: string;
  name: string;
  chain: TheaterChain;
}

export interface ApiShowtime {
  id: string;
  chain: TheaterChain;
  theaterName: string;
  movieTitle: string;
  screenName: string;
  screenType: string;
  startTime: string;
  endTime: string;
  totalSeats: number;
  remainingSeats: number;
}

export const chainColor: Record<TheaterChain, "purple" | "blue" | "teal"> = {
  CGV: "purple",
  MEGABOX: "blue",
  LOTTE: "teal",
};

export function seatStatus(remaining: number, total: number) {
  if (remaining === 0) return { variant: "error" as const, label: "매진" };
  const ratio = total > 0 ? remaining / total : 1;
  if (ratio < 0.1) return { variant: "warning" as const, label: "임박" };
  if (ratio < 0.3) return { variant: "warning" as const, label: "부족" };
  return { variant: "success" as const, label: "여유" };
}

export function seatBarColor(variant: "error" | "warning" | "success"): string {
  if (variant === "error") return "var(--color-error)";
  if (variant === "warning") return "var(--color-warning)";
  return "var(--color-success)";
}

export function todayIso(): string {
  return todayKst();
}

export function dateLabel(d: string): string {
  if (!d) return "";
  const date = new Date(kstMidnight(d));
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

export function isUpcoming(releaseDate?: string): boolean {
  if (!releaseDate) return false;
  return kstMidnight(releaseDate) > Date.now();
}

export type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export const SCREEN_CATEGORIES = [
  { key: "ALL", label: "전체" },
  { key: "2D", label: "2D" },
  { key: "3D", label: "3D" },
  { key: "IMAX", label: "IMAX" },
  { key: "4DX", label: "4DX" },
  { key: "ScreenX", label: "ScreenX" },
  { key: "Dolby Cinema", label: "Dolby Cinema" },
  { key: "CharLotte", label: "샤롯데" },
  { key: "Recliner", label: "리클라이너" },
  { key: "LED", label: "광음LED" },
  { key: "Special", label: "기타" },
] as const;

export function matchesCategory(screenType: string, cat: string): boolean {
  if (cat === "ALL") return true;
  const st = screenType.toUpperCase();
  if (cat === "Special") {
    return !["2D", "3D", "IMAX", "4DX", "SCREENX", "DOLBY CINEMA", "SOUNDX", "CHARLOTTE", "RECLINER", "LED"].some((c) =>
      st.includes(c),
    );
  }
  return st.includes(cat.toUpperCase());
}
