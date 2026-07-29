"use client";

import { memo, useMemo, useState, useCallback, useRef, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Grid } from "@astryxdesign/core/Grid";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { useMediaQuery } from "@astryxdesign/core/hooks";
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

  const rawStartMin = Math.min(...allShows.map((s) => timeToMinutes(s.startTime)));
  const rawEndMin = Math.max(...allShows.map((s) => timeToMinutes(s.endTime || s.startTime)));
  // 30분 단위 슬롯
  const slotSize = 30;
  // startMin을 슬롯 단위로 내림 정렬.
  const startMin = Math.floor(rawStartMin / slotSize) * slotSize;
  // endMin은 올림하여 마지막 회차가 잘리지 않도록.
  const endMin = Math.ceil((rawEndMin + 1) / slotSize) * slotSize;
  const totalSlots = Math.ceil((endMin - startMin) / slotSize);

  // 시간 라벨 (1시간 간격)
  const hourLabels: { slot: number; label: string }[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const min = startMin + i * slotSize;
    if (min % 60 === 0) {
      const h = Math.floor(min / 60);
      hourLabels.push({ slot: i, label: `${String(h).padStart(2, "0")}:00` });
    }
  }

  // 반응형: 모바일은 셀/라벨 축소
  const isMobile = useMediaQuery("(max-width: 640px)");
  const cellSize = isMobile ? 12 : 18;
  const labelWidth = isMobile ? 92 : 140;
  const headerHeight = isMobile ? 18 : 22;
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

      {isMobile && (
        <Text type="supporting" size="xsm">← 좌우로 스크롤하여 시간대를 확인하세요 →</Text>
      )}

      <div style={{ overflowX: "auto", width: "100%", WebkitOverflowScrolling: "touch" }}>
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
            {groups.map((group, idx) => (
              <HeatmapRow
                key={`${group.chain}-${group.name}`}
                group={group}
                startMin={startMin}
                totalSlots={totalSlots}
                slotSize={slotSize}
                cellSize={cellSize}
                gap={gap}
                labelWidth={labelWidth}
                tooltipBelow={idx === 0}
              />
            ))}
          </VStack>
        </div>
      </div>
    </VStack>
  );
}

interface HeatmapRowProps {
  group: HeatmapGroup;
  startMin: number;
  totalSlots: number;
  slotSize: number;
  cellSize: number;
  gap: number;
  labelWidth: number;
  tooltipBelow: boolean;
}

// 행 단위 메모이제이션: 동일 그룹은 리렌더 스킵.
const HeatmapRow = memo(function HeatmapRow({
  group,
  startMin,
  totalSlots,
  slotSize,
  cellSize,
  gap,
  labelWidth,
  tooltipBelow,
}: HeatmapRowProps) {
  // 슬롯 매칭을 Map으로 한 번에 구축 (O(shows)). 슬롯마다 find() 돌리지 않는다.
  const sortedShows = useMemo(
    () => [...group.shows].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [group.shows],
  );
  const slotMap = useMemo(() => {
    const m = new Map<number, ApiShowtime>();
    for (const s of sortedShows) {
      const sMin = timeToMinutes(s.startTime);
      const slot = Math.floor((sMin - startMin) / slotSize);
      if (slot >= 0 && slot < totalSlots && !m.has(slot)) m.set(slot, s);
    }
    return m;
  }, [sortedShows, startMin, slotSize, totalSlots]);

  return (
    <div
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
        const show = slotMap.get(i);
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
        const tooltip = `${show.startTime} · ${st.label} · ${show.screenType} · ${show.remainingSeats}/${show.totalSeats}석`;
        return (
          <span
            key={i}
            className="heatmap-cell"
            style={{ position: "relative", display: "inline-flex" }}
          >
            <span
              role="tooltip"
              className="heatmap-tooltip"
              style={{
                position: "absolute",
                ...(tooltipBelow
                  ? { top: "calc(100% + 6px)" }
                  : { bottom: "calc(100% + 6px)" }),
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--color-background-surface)",
                color: "var(--color-text)",
                border: "var(--spacing-0-5) solid var(--color-border)",
                borderRadius: "var(--radius-1)",
                boxShadow: "var(--shadow-2)",
                padding: "var(--spacing-2) var(--spacing-3)",
                fontSize: 12,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                opacity: 0,
                transition: "opacity 0.15s ease",
                zIndex: 100,
              }}
            >
              {tooltip}
            </span>
            <button
              type="button"
              aria-label={tooltip}
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
                const tip = e.currentTarget.previousElementSibling as HTMLElement;
                if (tip) tip.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "none";
                const tip = e.currentTarget.previousElementSibling as HTMLElement;
                if (tip) tip.style.opacity = "0";
              }}
              onClick={(e) => {
                // 모바일 터치: 토글. 다른 셀 툴팁은 끄기.
                const allTips = e.currentTarget
                  .closest(".heatmap-cell")
                  ?.parentElement
                  ?.querySelectorAll(".heatmap-tooltip");
                allTips?.forEach((t) => {
                  if (t !== e.currentTarget.previousElementSibling) {
                    (t as HTMLElement).style.opacity = "0";
                  }
                });
                const tip = e.currentTarget.previousElementSibling as HTMLElement;
                if (tip) {
                  const isShown = tip.style.opacity === "1";
                  tip.style.opacity = isShown ? "0" : "1";
                }
              }}
            />
          </span>
        );
      })}
    </div>
  );
});

function chainColorForHeatmap(chain: TheaterChain): "purple" | "blue" | "teal" {
  if (chain === "CGV") return "purple";
  if (chain === "MEGABOX") return "blue";
  return "teal";
}
