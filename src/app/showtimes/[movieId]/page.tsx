import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMovieByCode } from "../../../lib/kofic";
import type { ApiMovie } from "../../../lib/ui";
import { ShowtimesClient } from "../ShowtimesClient";

interface ShowtimesPageProps {
  params: Promise<{ movieId: string }>;
}

async function getMovie(movieId: string): Promise<ApiMovie | null> {
  if (!/^\d+$/.test(movieId)) return null;

  const movie = await getMovieByCode(movieId);
  if (!movie) return null;

  return {
    id: movie.movieCd,
    title: movie.movieNm,
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    overview: movie.overview,
    rating: movie.rating,
    releaseDate: movie.openDt,
    rank: movie.rank,
    runtimeMin: movie.runtimeMin,
    genres: movie.genres,
    audiAcc: movie.audiAcc,
    isUpcoming: Boolean(
      movie.openDt && new Date(`${movie.openDt}T00:00:00+09:00`).getTime() > Date.now(),
    ),
  };
}

export async function generateMetadata({ params }: ShowtimesPageProps): Promise<Metadata> {
  const { movieId } = await params;
  const movie = await getMovie(movieId);
  if (!movie) return { title: "영화를 찾을 수 없습니다", robots: { index: false } };

  const title = `${movie.title} 상영시간표`;
  const details = [
    movie.releaseDate ? `${movie.releaseDate} 개봉` : null,
    movie.rating || null,
    movie.isUpcoming ? "개봉예정작" : null,
  ].filter(Boolean);
  const description = `${movie.title}${details.length ? ` (${details.join(", ")})` : ""}의 CGV, 롯데시네마, 메가박스 상영시간과 실시간 잔여 좌석을 지역별·날짜별로 비교하세요.`;
  const canonical = `/showtimes/${movie.id}`;
  const images = movie.posterUrl
    ? [{ url: movie.posterUrl, alt: `${movie.title} 포스터` }]
    : undefined;

  return {
    title,
    description,
    keywords: [
      movie.title,
      `${movie.title} 상영시간표`,
      `${movie.title} 예매`,
      `${movie.title} 잔여좌석`,
      "CGV",
      "롯데시네마",
      "메가박스",
    ],
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "MovieScanner",
      title,
      description,
      url: canonical,
      images,
    },
    twitter: {
      card: movie.posterUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: movie.posterUrl ? [movie.posterUrl] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function ShowtimesPage({ params }: ShowtimesPageProps) {
  const { movieId } = await params;
  const movie = await getMovie(movieId);
  if (!movie) notFound();

  return <ShowtimesClient movie={movie} />;
}
