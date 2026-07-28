"use client";

import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Grid } from "@astryxdesign/core/Grid";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Popover } from "@astryxdesign/core/Popover";
import type { ApiMovie, ApiShowtime } from "../lib/ui";
import { isUpcoming, seatStatus, seatBarColor } from "../lib/ui";
import type { TheaterChain } from "../lib/types";

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
            <Token size="sm" color="orange" label="개봉예정" />
          )}
        </HStack>
      </VStack>
    </VStack>
  );
}

function seatTokenColor(
  remaining: number,
  total: number,
): "green" | "orange" | "red" | "gray" {
  if (remaining === 0) return "gray";
  const ratio = total > 0 ? remaining / total : 1;
  if (ratio < 0.1) return "red";
  if (ratio < 0.3) return "orange";
  return "green";
}

/** 인라인 시간 칩: 색상으로 좌석 상태를 표현 */
export function TimeChips({ shows, maxChips = 8 }: { shows: ApiShowtime[]; maxChips?: number }) {
  const sorted = [...shows].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const visible = sorted.slice(0, maxChips);
  const overflow = sorted.length - visible.length;

  return (
    <HStack gap={1} wrap="wrap" align="center">
      {visible.map((s) => {
        const soldOut = s.remainingSeats === 0;
        return (
          <Token
            key={s.id}
            size="sm"
            color={seatTokenColor(s.remainingSeats, s.totalSeats)}
            label={s.startTime}
            style={{
              fontVariantNumeric: "tabular-nums",
              ...(soldOut
                ? { textDecoration: "line-through", opacity: 0.6 }
                : {}),
            }}
          />
        );
      })}
      {overflow > 0 && (
        <Text type="supporting" size="xsm">+{overflow}</Text>
      )}
    </HStack>
  );
}

export function ShowtimeGrid({ shows }: { shows: ApiShowtime[] }) {
  const sorted = [...shows].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  return (
    <Grid columns={{ minWidth: 160, repeat: "fit" }} gap={2}>
      {sorted.map((s) => {
        const st = seatStatus(s.remainingSeats, s.totalSeats);
        const ratio = s.totalSeats > 0 ? s.remainingSeats / s.totalSeats : 0;
        return (
          <VStack key={s.id} gap={1} padding={2} align="stretch" width="100%">
            <HStack gap={1} align="center" justify="between" width="100%">
              <Text weight="semibold" size="lg" textWrap="nowrap" hasTabularNumbers>
                {s.startTime}
              </Text>
              <HStack gap={1} align="center">
                <StatusDot variant={st.variant} label={st.label} />
                <Text type="supporting" size="xsm" textWrap="nowrap">{st.label}</Text>
              </HStack>
            </HStack>
            <Text type="supporting" size="xsm" maxLines={1} wordBreak="break-word">
              {s.screenName}
            </Text>
            <Text type="supporting" size="xsm" maxLines={1} wordBreak="break-word">
              {s.screenType}
            </Text>
            <Text type="label" size="xsm" textWrap="nowrap" hasTabularNumbers>
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

/* ── 히트맵 (잔디) 심플 모드 ── */

interface HeatmapGroup {
  chain: TheaterChain;
  name: string;
  shows: ApiShowtime[];
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function seatCellColor(remaining: number, total: number): string {
  if (remaining === 0) return "var(--color-neutral)";
  const ratio = total > 0 ? remaining / total : 1;
  if (ratio < 0.1) return "var(--color-error)";
  if (ratio < 0.3) return "var(--color-warning)";
  return "var(--color-success)";
}

export function ShowtimeHeatmap({ groups }: { groups: HeatmapGroup[] }) {
  // 전체 시간 범위 계산 (가장 이른 시작 ~ 가장 늦은 종료)
  const allShows = groups.flatMap((g) => g.shows);
  if (allShows.length === 0) return null;

  const startMin = Math.min(...allShows.map((s) => timeToMinutes(s.startTime)));
  const endMin = Math.max(...allShows.map((s) => timeToMinutes(s.endTime || s.startTime)));
  // 30분 단위 슬롯
  const slotSize = 30;
  const totalSlots = Math.ceil((endMin - startMin + 1) / slotSize);

  // 시간 라벨 (1시간 간격)
  const hourLabels: { slot: number; label: string }[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const min = startMin + i * slotSize;
    if (min % 60 === 0) {
      const h = Math.floor(min / 60);
      hourLabels.push({ slot: i, label: `${String(h).padStart(2, "0")}:00` });
    }
  }

  const cellSize = 18;
  const labelWidth = 140;
  const headerHeight = 22;
  const gap = 2;

  return (
    <VStack gap={2} align="start" width="100%">
      <HStack gap={3} wrap="wrap">
        <HStack gap={1} align="center">
          <span style={{ width: 12, height: 12, borderRadius: "var(--radius-1)", background: "var(--color-success)" }} />
          <Text type="supporting" size="xsm">여유</Text>
        </HStack>
        <HStack gap={1} align="center">
          <span style={{ width: 12, height: 12, borderRadius: "var(--radius-1)", background: "var(--color-warning)" }} />
          <Text type="supporting" size="xsm">부족</Text>
        </HStack>
        <HStack gap={1} align="center">
          <span style={{ width: 12, height: 12, borderRadius: "var(--radius-1)", background: "var(--color-error)" }} />
          <Text type="supporting" size="xsm">임박</Text>
        </HStack>
        <HStack gap={1} align="center">
          <span style={{ width: 12, height: 12, borderRadius: "var(--radius-1)", background: "var(--color-neutral)" }} />
          <Text type="supporting" size="xsm">매진</Text>
        </HStack>
      </HStack>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <div style={{ minWidth: labelWidth + totalSlots * (cellSize + gap) }}>
          {/* 시간 헤더 */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              height: headerHeight,
              paddingLeft: labelWidth,
              gap,
              marginBottom: "var(--spacing-1)",
            }}
          >
            {Array.from({ length: totalSlots }, (_, i) => {
              const hl = hourLabels.find((h) => h.slot === i);
              return (
                <div
                  key={i}
                  style={{
                    width: cellSize,
                    flexShrink: 0,
                    fontSize: 10,
                    color: "var(--color-text-supporting)",
                    fontFamily: "var(--font-mono, monospace)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "visible",
                  }}
                >
                  {hl ? hl.label : ""}
                </div>
              );
            })}
          </div>

          {/* 각 영화관 행 */}
          <VStack gap={gap} align="start">
            {groups.map((group) => {
              const sortedShows = [...group.shows].sort((a, b) =>
                a.startTime.localeCompare(b.startTime),
              );
              return (
                <div
                  key={`${group.chain}-${group.name}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: cellSize,
                    gap,
                  }}
                >
                  {/* 영화관명 */}
                  <div
                    style={{
                      width: labelWidth,
                      flexShrink: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: "var(--spacing-2)",
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--spacing-1)",
                    }}
                  >
                    <Badge variant={chainColorForHeatmap(group.chain)} label={group.chain} />
                    <Text size="xsm" maxLines={1} weight="semibold">{group.name}</Text>
                  </div>

                  {/* 슬롯 셀들 */}
                  {Array.from({ length: totalSlots }, (_, i) => {
                    const slotMin = startMin + i * slotSize;
                    const show = sortedShows.find((s) => {
                      const sMin = timeToMinutes(s.startTime);
                      return sMin >= slotMin && sMin < slotMin + slotSize;
                    });
                    if (!show) {
                      return (
                        <div
                          key={i}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            flexShrink: 0,
                            borderRadius: "var(--radius-1)",
                            background: "var(--color-background-muted)",
                          }}
                        />
                      );
                    }
                    const st = seatStatus(show.remainingSeats, show.totalSeats);
                    return (
                      <Popover
                        key={i}
                        placement="above"
                        alignment="center"
                        hasAutoFocus={false}
                        content={
                          <VStack gap={1} padding={3} align="start" width={220}>
                            <HStack gap={1} align="center" justify="between" width="100%">
                              <Text weight="semibold" size="lg" hasTabularNumbers>
                                {show.startTime}
                              </Text>
                              <HStack gap={1} align="center">
                                <StatusDot variant={st.variant} label={st.label} />
                                <Text type="supporting" size="xsm">{st.label}</Text>
                              </HStack>
                            </HStack>
                            <Text type="supporting" size="xsm" maxLines={2} wordBreak="break-word" textWrap="pretty">
                              {show.screenName}
                            </Text>
                            <Text type="supporting" size="xsm" maxLines={2} wordBreak="break-word" textWrap="pretty">
                              {show.screenType}
                            </Text>
                            <Text type="label" size="xsm" hasTabularNumbers>
                              {show.remainingSeats}/{show.totalSeats}석
                            </Text>
                          </VStack>
                        }
                      >
                        <button
                          type="button"
                          aria-label={`${show.startTime} ${st.label}`}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            flexShrink: 0,
                            padding: 0,
                            border: "none",
                            borderRadius: "var(--radius-1)",
                            background: seatCellColor(show.remainingSeats, show.totalSeats),
                            cursor: "pointer",
                            transition: "transform 0.1s, box-shadow 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "scale(1.4)";
                            e.currentTarget.style.boxShadow = "var(--shadow-1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "scale(1)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        />
                      </Popover>
                    );
                  })}
                </div>
              );
            })}
          </VStack>
        </div>
      </div>
    </VStack>
  );
}

function chainColorForHeatmap(chain: TheaterChain): "purple" | "blue" | "teal" {
  if (chain === "CGV") return "purple";
  if (chain === "MEGABOX") return "blue";
  return "teal";
}
