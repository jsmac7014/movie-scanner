import { NextResponse } from "next/server";
import { getBoxOfficeMovies, getUpcomingMovies } from "../../../lib/kofic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const [boxOffice, upcoming] = await Promise.all([
      getBoxOfficeMovies(),
      getUpcomingMovies(),
    ]);

    // 박스오피스(상영중) + 개봉예정 합치기
    const boxOfficeMovies = boxOffice.map((m) => ({
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
        isUpcoming: Boolean(
          m.openDt && new Date(`${m.openDt}T00:00:00+09:00`).getTime() > Date.now(),
        ),
      }));
    const boxOfficeIds = new Set(boxOfficeMovies.map((movie) => movie.id));
    const movies = [
      ...boxOfficeMovies,
      ...upcoming.filter((m) => !boxOfficeIds.has(m.movieCd)).map((m) => ({
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
        isUpcoming: Boolean(
          m.openDt && new Date(`${m.openDt}T00:00:00+09:00`).getTime() > Date.now(),
        ),
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
