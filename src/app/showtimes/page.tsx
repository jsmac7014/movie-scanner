import { permanentRedirect, redirect } from "next/navigation";
import { getBoxOfficeMovies, getUpcomingMovies } from "../../lib/kofic";

interface LegacyShowtimesPageProps {
  searchParams: Promise<{ movie?: string | string[] }>;
}

export default async function LegacyShowtimesPage({
  searchParams,
}: LegacyShowtimesPageProps) {
  const value = (await searchParams).movie;
  const title = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!title) redirect("/");

  const [boxOffice, upcoming] = await Promise.all([
    getBoxOfficeMovies(),
    getUpcomingMovies(),
  ]);
  const movie = [...boxOffice, ...upcoming].find((item) => item.movieNm === title);
  if (!movie) redirect("/");

  permanentRedirect(`/showtimes/${movie.movieCd}`);
}
