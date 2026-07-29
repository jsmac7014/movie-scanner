import { NextResponse } from "next/server";
import { getNowPlayingMovies, getUpcomingOnlyMovies } from "../../../lib/nowplaying";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isUpcomingDate(openDt: string): boolean {
  if (!openDt) return false;
  const ts = new Date(`${openDt}T00:00:00+09:00`).getTime();
  return !isNaN(ts) && ts > Date.now();
}

export async function GET() {
  try {
    const [nowPlaying, upcoming] = await Promise.all([
      getNowPlayingMovies(),
      getUpcomingOnlyMovies(),
    ]);

    const nowPlayingIds = new Set(nowPlaying.map((m) => m.movieCd));
    const upcomingFiltered = upcoming.filter((m) => !nowPlayingIds.has(m.movieCd));

    const movies = [
      ...nowPlaying.map((m) => ({
        id: m.movieCd,
        title: m.movieNm,
        posterUrl: m.posterUrl,
        backdropUrl: m.backdropUrl,
        overview: m.overview,
        rating: m.rating,
        releaseDate: m.openDt,
        rank: m.rank,
        runtimeMin: m.runtimeMin,
        genres: m.genres,
        audiAcc: m.audiAcc,
        isUpcoming: isUpcomingDate(m.openDt),
        chains: m.chains,
      })),
      ...upcomingFiltered.map((m) => ({
        id: m.movieCd,
        title: m.movieNm,
        posterUrl: m.posterUrl,
        backdropUrl: m.backdropUrl,
        overview: m.overview,
        rating: m.rating,
        releaseDate: m.openDt,
        rank: m.rank,
        runtimeMin: m.runtimeMin,
        genres: m.genres,
        audiAcc: m.audiAcc,
        isUpcoming: true,
        chains: m.chains,
      })),
    ];

    return NextResponse.json({ movies, count: movies.length });
  } catch (e) {
    return NextResponse.json(
      {
        error: "영화 목록 불러오기 실패",
        detail: e instanceof Error ? e.message : String(e),
        movies: [],
      },
      { status: 502 },
    );
  }
}