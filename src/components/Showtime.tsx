"use client";

import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import type { ApiMovie, ApiShowtime } from "../lib/ui";
import { isUpcoming, seatStatus, seatBarColor } from "../lib/ui";

export function MoviePosterCard({
  movie,
  onSelect,
}: {
  movie: ApiMovie;
  onSelect: () => void;
}) {
  return (
    <VStack
      gap={2}
      padding={2}
      align="center"
      onClick={onSelect}
      style={{
        cursor: "pointer",
        borderRadius: "var(--radius-container)",
        background: "var(--color-background-surface)",
        border: "var(--spacing-0-5) solid transparent",
        transition: "border-color 0.2s, box-shadow 0.2s",
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
            style={{
              background: "var(--color-background-muted)",
              borderRadius: "var(--radius-field)",
            }}
          >
            <Text type="supporting">포스터 없음</Text>
          </VStack>
        )}
      </AspectRatio>
      <VStack gap={1} align="center" width="100%">
        <Text weight="semibold" maxLines={1}>{movie.title}</Text>
        <HStack gap={1} align="center">
          {movie.rating && <Text type="supporting" size="xsm">{movie.rating}</Text>}
          {isUpcoming(movie.releaseDate) && (
            <Badge variant="orange" label="개봉예정" />
          )}
        </HStack>
      </VStack>
    </VStack>
  );
}

export function ShowtimeGrid({ shows }: { shows: ApiShowtime[] }) {
  const sorted = [...shows].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  return (
    <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={2}>
      {sorted.map((s) => {
        const st = seatStatus(s.remainingSeats, s.totalSeats);
        const ratio = s.totalSeats > 0 ? s.remainingSeats / s.totalSeats : 0;
        return (
          <VStack key={s.id} gap={1} padding={3} align="stretch" width="100%">
            <HStack gap={1} align="center" justify="between" width="100%">
              <Text weight="semibold" size="lg" textWrap="nowrap" hasTabularNumbers>
                {s.startTime}
              </Text>
              <HStack gap={1} align="center">
                <StatusDot variant={st.variant} label={st.label} />
                <Text type="supporting" textWrap="nowrap">{st.label}</Text>
              </HStack>
            </HStack>
            <Text type="supporting" maxLines={2} wordBreak="break-word" textWrap="pretty">
              {s.screenName}
            </Text>
            <Text type="supporting" maxLines={2} wordBreak="break-word" textWrap="pretty">
              {s.screenType}
            </Text>
            <Text type="label" textWrap="nowrap" hasTabularNumbers>
              {s.remainingSeats}/{s.totalSeats}석
            </Text>
            <span
              style={{
                display: "block",
                width: "100%",
                height: "var(--spacing-1)",
                borderRadius: "var(--radius-pill)",
                background: "var(--color-neutral)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: `${Math.round(ratio * 100)}%`,
                  height: "100%",
                  background: seatBarColor(st.variant),
                  transition: "width 0.3s ease",
                }}
              />
            </span>
          </VStack>
        );
      })}
    </Grid>
  );
}
