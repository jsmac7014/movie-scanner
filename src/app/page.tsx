"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Section } from "@astryxdesign/core/Section";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { AppFrame } from "../components/AppFrame";
import type { ApiMovie } from "../lib/ui";
import { isUpcoming, dateLabel } from "../lib/ui";

export default function HomePage() {
  const router = useRouter();
  const [movies, setMovies] = useState<ApiMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isMobile = useMediaQuery("(max-width: 640px)");

  useEffect(() => {
    // sessionStorage 캐싱: 5분 내 재방문 시 API 호출 스킵
    const CACHE_KEY = "movie-scanner:movies";
    const CACHE_TTL = 5 * 60 * 1000;
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts, movies: cachedMovies } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          setMovies(cachedMovies);
          setLoading(false);
          return;
        }
      }
    } catch {}

    fetch("/api/movies")
      .then((r) => r.json())
      .then((d) => {
        const movies = d.movies || [];
        setMovies(movies);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), movies }));
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (movie: ApiMovie) => {
    sessionStorage.setItem("movie-scanner-scroll-y", String(window.scrollY));
    router.push(`/showtimes/${movie.id}`);
  };

  // 그룹화: 박스오피스 Top10, 개봉예정, 장르별
  const top10 = movies.filter((m) => !m.isUpcoming).slice(0, 10);
  const upcoming = movies.filter((m) => m.isUpcoming);
  const nowPlaying = movies.filter((m) => !m.isUpcoming);

  useEffect(() => {
    if (top10.length < 2) return;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % top10.length);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [top10.length]);

  useEffect(() => {
    if (loading || movies.length === 0) return;
    const saved = sessionStorage.getItem("movie-scanner-scroll-y");
    if (!saved) return;
    sessionStorage.removeItem("movie-scanner-scroll-y");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Number(saved), behavior: "instant" });
    });
  }, [loading, movies.length]);

  // 박스오피스 순위대로 10초마다 순환
  const heroMovie = top10[heroIndex % Math.max(top10.length, 1)] || nowPlaying[0];

  if (loading) {
    return (
      <AppFrame>
        <VStack gap={4} align="center" padding={10}>
          <Spinner size="lg" label="상영 중인 영화 목록을 불러오는 중..." />
        </VStack>
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      {/* 히어로 배너 */}
      {heroMovie && (
        <VStack
          gap={0}
          height="70vh"
          style={{ position: "relative", overflow: "hidden" }}
        >
          {top10.map((movie, index) => (
            <HeroBanner
              key={movie.id}
              movie={movie}
              isActive={index === heroIndex}
              prefersReducedMotion={prefersReducedMotion}
              isMobile={isMobile}
              onSelect={() => handleSelect(movie)}
            />
          ))}
        </VStack>
      )}

      {/* 캐러셀 행들 */}
      <VStack gap={isMobile ? 4 : 6} padding={isMobile ? 3 : 6} style={{ background: "var(--color-background-body)" }}>
        {top10.length > 0 && (
          <CarouselRow title="박스오피스 Top 10" movies={top10} onSelect={handleSelect} />
        )}
        {upcoming.length > 0 && (
          <CarouselRow title="개봉 예정작" movies={upcoming} onSelect={handleSelect} />
        )}
        {nowPlaying.length > 0 && (
          <CarouselRow title="현재 상영작 전체" movies={nowPlaying} onSelect={handleSelect} />
        )}
      </VStack>
    </AppFrame>
  );
}

function HeroBanner({
  movie,
  isActive,
  prefersReducedMotion,
  isMobile,
  onSelect,
}: {
  movie: ApiMovie;
  isActive: boolean;
  prefersReducedMotion: boolean;
  isMobile: boolean;
  onSelect: () => void;
}) {
  return (
    <VStack
      gap={0}
      justify="end"
      style={{
        position: "absolute",
        inset: 0,
        minHeight: "var(--spacing-10)",
        height: isMobile ? "55vh" : "70vh",
        opacity: isActive ? 1 : 0,
        pointerEvents: isActive ? "auto" : "none",
        transition: prefersReducedMotion
          ? "none"
          : "opacity var(--duration-slow-min) var(--ease-standard)",
        background: movie.backdropUrl
          ? `linear-gradient(to top, var(--color-background-body) 0%, transparent ${isMobile ? "70%" : "50%"}), url(${movie.backdropUrl}) center/cover no-repeat`
          : "var(--color-background-muted)",
      }}
    >
      {/* 그라데이션 오버레이 */}
      <span
        style={{
          position: "absolute",
          inset: "0",
          background: isMobile
            ? "linear-gradient(to top, var(--color-background-body) 0%, transparent 80%)"
            : "linear-gradient(to right, var(--color-background-body) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <VStack
        gap={isMobile ? 2 : 3}
        align="start"
        padding={isMobile ? 3 : 6}
        maxWidth={isMobile ? "100%" : 600}
        style={{ position: "relative", zIndex: 1 }}
      >
        {movie.rank === 1 && <Badge variant="red" label="박스오피스 1위" />}
        <Heading level={1} type={isMobile ? "display-2" : "display-1"} color="inherit" textWrap="balance">
          {movie.title}
        </Heading>
        <HStack gap={3} align="center" wrap="wrap">
          {movie.rating && <Text color="inherit">{movie.rating}</Text>}
          {movie.releaseDate && (
            <Text color="inherit" type="supporting">개봉 {dateLabel(movie.releaseDate)}</Text>
          )}
          {movie.runtimeMin && (
            <Text color="inherit" type="supporting">{movie.runtimeMin}분</Text>
          )}
          {movie.audiAcc && movie.audiAcc > 0 && (
            <Text color="inherit" type="supporting">
              누적 {Math.round(movie.audiAcc / 10000)}만명
            </Text>
          )}
        </HStack>
        {movie.overview && (
          <Text color="inherit" maxLines={3}>
            {movie.overview}
          </Text>
        )}
        <HStack gap={2}>
          <Button
            variant="primary"
            size="lg"
            isDisabled={!isActive}
            onClick={onSelect}
            label="상영시간표 보기"
          />
        </HStack>
      </VStack>
    </VStack>
  );
}

function CarouselRow({
  title,
  movies,
  onSelect,
}: {
  title: string;
  movies: ApiMovie[];
  onSelect: (m: ApiMovie) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [movies]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.85, 160);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <VStack gap={2} align="start" width="100%">
      <Heading level={3}>{title}</Heading>
      <Section padding={0} variant="transparent" width="100%" style={{ position: "relative" }}>
        <ScrollButton
          dir="left"
          onClick={() => scroll("left")}
          isDisabled={!canScrollLeft}
        />
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          style={{
            display: "flex",
            gap: "var(--spacing-3)",
            overflowX: "auto",
            overflowY: "hidden",
            scrollBehavior: "smooth",
            scrollSnapType: "x mandatory",
            scrollbarWidth: "none",
            padding: "var(--spacing-2) 0",
          }}
        >
          {movies.map((m) => (
            <MovieCard
              key={m.id}
              movie={m}
              onSelect={() => onSelect(m)}
            />
          ))}
        </div>
        <ScrollButton
          dir="right"
          onClick={() => scroll("right")}
          isDisabled={!canScrollRight}
        />
      </Section>
    </VStack>
  );
}

function MovieCard({
  movie,
  onSelect,
}: {
  movie: ApiMovie;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      style={{
        position: "relative",
        flexShrink: 0,
        width: "calc(var(--spacing-10) * 4)",
        cursor: "pointer",
        scrollSnapAlign: "start",
      }}
    >
      <VStack
        gap={0}
        padding={0}
        align="center"
        style={{
          borderRadius: "var(--radius-field)",
          overflow: "hidden",
          border: `var(--spacing-0-5) solid ${hovered ? "var(--color-accent)" : "transparent"}`,
          transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: hovered ? "var(--shadow-2)" : "none",
        }}
      >
        <AspectRatio ratio={2 / 3} fit="cover">
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={movie.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "var(--radius-field)",
              }}
            />
          ) : (
            <VStack
              gap={2}
              align="center"
              justify="center"
              width="100%"
              height="100%"
              style={{ background: "var(--color-background-muted)" }}
            >
              <Text weight="semibold" maxLines={3}>{movie.title}</Text>
            </VStack>
          )}
        </AspectRatio>
      </VStack>
    </div>
  );
}

function ScrollButton({
  dir,
  onClick,
  isDisabled,
}: {
  dir: "left" | "right";
  onClick: () => void;
  isDisabled: boolean;
}) {
  return (
    <IconButton
      onClick={onClick}
      label={dir === "left" ? "이전 영화" : "다음 영화"}
      tooltip={dir === "left" ? "이전" : "다음"}
      icon={<Icon icon={dir === "left" ? "chevronLeft" : "chevronRight"} />}
      variant="primary"
      size="lg"
      elevation="high"
      isDisabled={isDisabled}
      style={{
        position: "absolute",
        top: "50%",
        [dir === "left" ? "left" : "right"]: "var(--spacing-1)",
        transform: "translateY(-50%)",
        zIndex: 5,
        opacity: isDisabled ? 0 : 1,
        transition: "opacity 0.2s",
      }}
    />
  );
}
