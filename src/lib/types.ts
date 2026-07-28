export type TheaterChain = "CGV" | "MEGABOX" | "LOTTE";

export interface Region {
  id: string;
  name: string;
}

export interface Theater {
  id: string;
  name: string;
  chain: TheaterChain;
  regionId: string;
  address: string;
  /** 체인 내부 극장 식별자 (크롤링 시 사용) */
  chainTheaterId: string;
}

export type ScreenType =
  | "2D"
  | "3D"
  | "IMAX"
  | "4DX"
  | "Dolby Cinema"
  | "ScreenX"
  | "Recliner"
  | "Special"
  | string;

export interface Showtime {
  id: string;
  movieId: string;
  movieTitle: string;
  theaterId: string;
  screenName: string;
  screenType: ScreenType;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  totalSeats: number;
  remainingSeats: number;
}

export interface Movie {
  id: string;
  title: string;
  posterUrl?: string;
  rating: string; // 관람등급
  runtimeMin: number;
}

/** 크롤러가 반환하는 원시 상영정보 (체인별 극장/영화 ID를 그대로 보관) */
export interface CrawledShowtime {
  id: string;
  chain: TheaterChain;
  chainTheaterId: string;
  chainTheaterName: string;
  chainMovieId: string;
  movieTitle: string;
  screenName: string;
  screenType: ScreenType;
  startTime: string;
  endTime: string;
  totalSeats: number;
  remainingSeats: number;
}
