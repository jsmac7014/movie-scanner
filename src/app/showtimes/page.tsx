import { permanentRedirect, redirect } from "next/navigation";
import { getNowPlayingMovies, getUpcomingOnlyMovies } from "../../lib/nowplaying";

interface LegacyShowtimesPageProps {
  searchParams: Promise<{ movie?: string | string[] }>;
}

export default async function LegacyShowtimesPage({
  searchParams,
}: LegacyShowtimesPageProps) {
  const value = (await searchParams).movie;
  const title = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!title) redirect("/");

  const [nowPlaying, upcoming] = await Promise.all([
    getNowPlayingMovies(),
    getUpcomingOnlyMovies(),
  ]);
  const movie = [...nowPlaying, ...upcoming].find((item) => item.movieNm === title);
  if (!movie) redirect("/");

  permanentRedirect(`/showtimes/${movie.movieCd}`);
}