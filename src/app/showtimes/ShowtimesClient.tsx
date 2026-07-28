"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { SegmentedControl } from "@astryxdesign/core/SegmentedControl";
import { SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { AppFrame } from "../../components/AppFrame";
import { ShowtimeGrid } from "../../components/Showtime";
import type { TheaterChain } from "../../lib/types";
import {
  type ApiMovie,
  type ApiShowtime,
  type Region,
  type ISODate,
  chainColor,
  isUpcoming,
  todayIso,
  dateLabel,
  SCREEN_CATEGORIES,
  matchesCategory,
} from "../../lib/ui";

export function ShowtimesClient({ movie }: { movie: ApiMovie }) {
  const router = useRouter();

  const [regions, setRegions] = useState<Region[]>([]);

  const [regionId, setRegionId] = useState("");
  const [date, setDate] = useState<string>(todayIso());

  const [showtimes, setShowtimes] = useState<ApiShowtime[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crawledAt, setCrawledAt] = useState<string | null>(null);
  const [screenFilter, setScreenFilter] = useState<string>("ALL");
  const [sortMode, setSortMode] = useState<string>("time");

  useEffect(() => {
    fetch("/api/regions")
      .then((r) => r.json())
      .then((d) => {
        setRegions(d.regions || []);
      })
      .catch(() => {});
  }, []);

  const handleRegionChange = (value: string | null) => {
    setRegionId(value ?? "");
    setShowtimes([]);
    setError(null);
    setSearched(false);
  };

  const canSearch = Boolean(movie.title && regionId);

  const doSearch = useCallback(async () => {
    if (!movie.title || !regionId) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setScreenFilter("ALL");
    try {
      const params = new URLSearchParams({ region: regionId, movie: movie.title });
      if (date) params.set("date", date);
      const res = await fetch(`/api/showtimes?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "데이터를 불러오지 못했습니다");
        setShowtimes([]);
      } else {
        setShowtimes(data.showtimes || []);
        setCrawledAt(data.crawledAt || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setShowtimes([]);
    } finally {
      setLoading(false);
    }
  }, [movie.title, regionId, date]);

  const filtered = useMemo(() => {
    const list = movie.title
      ? showtimes.filter((s) => s.movieTitle === movie.title)
      : showtimes;
    const byCategory = screenFilter === "ALL"
      ? list
      : list.filter((s) => matchesCategory(s.screenType, screenFilter));
    return [...byCategory].sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        a.theaterName.localeCompare(b.theaterName),
    );
  }, [showtimes, movie.title, screenFilter]);

  const categoryCounts = useMemo(() => {
    const list = movie.title
      ? showtimes.filter((s) => s.movieTitle === movie.title)
      : showtimes;
    const counts: Record<string, number> = {};
    for (const cat of SCREEN_CATEGORIES) {
      counts[cat.key] = list.filter((s) => matchesCategory(s.screenType, cat.key)).length;
    }
    return counts;
  }, [showtimes, movie.title]);

  const groupedByTheater = useMemo(() => {
    const map = new Map<
      string,
      { chain: TheaterChain; name: string; shows: ApiShowtime[] }
    >();
    for (const s of filtered) {
      const key = `${s.chain}|${s.theaterName}`;
      if (!map.has(key))
        map.set(key, { chain: s.chain, name: s.theaterName, shows: [] });
      map.get(key)!.shows.push(s);
    }
    const groups = [...map.values()].map((group) => {
      const sortedShows = [...group.shows].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
      return {
        ...group,
        shows: sortedShows,
        firstTime: sortedShows[0]?.startTime || "--:--",
        maxRemaining: Math.max(...sortedShows.map((show) => show.remainingSeats), 0),
        screenTypes: [...new Set(sortedShows.map((show) => show.screenType))],
      };
    });

    return groups.sort((a, b) => {
      if (sortMode === "seats") return b.maxRemaining - a.maxRemaining;
      if (sortMode === "name") return a.name.localeCompare(b.name, "ko");
      return a.firstTime.localeCompare(b.firstTime);
    });
  }, [filtered, sortMode]);

  const availableCategories = useMemo(
    () => SCREEN_CATEGORIES.filter((c) => c.key === "ALL" || categoryCounts[c.key] > 0),
    [categoryCounts],
  );

  return (
    <AppFrame backHref="/">
      {/* 메인 화면과 같은 넷플릭스풍 영화 히어로 */}
      <VStack
        gap={0}
        justify="end"
        style={{
          position: "relative",
          minHeight: "55vh",
          background: movie.backdropUrl
            ? `linear-gradient(to top, var(--color-background-body) 0%, transparent 60%), url(${movie.backdropUrl}) center/cover no-repeat`
            : "var(--color-background-muted)",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: "0",
            background: "linear-gradient(to right, var(--color-background-body) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <VStack gap={4} padding={6} style={{ position: "relative", zIndex: 1 }}>
          <VStack gap={2} align="start" maxWidth={600}>
            <HStack gap={2} align="center" wrap="wrap">
              <Heading level={1} type="display-1" color="inherit" textWrap="balance">
                {movie.title}
              </Heading>
              {isUpcoming(movie.releaseDate) && (
                <Badge variant="orange" label="개봉예정" />
              )}
            </HStack>
            <HStack gap={3} align="center" wrap="wrap">
              {movie.rating && <Text color="inherit">{movie.rating}</Text>}
              {movie.releaseDate && (
                <Text color="inherit" type="supporting">
                  개봉 {dateLabel(movie.releaseDate)}
                </Text>
              )}
              {movie.runtimeMin && (
                <Text color="inherit" type="supporting">{movie.runtimeMin}분</Text>
              )}
            </HStack>
            {movie.overview && (
              <Text color="inherit" maxLines={3}>{movie.overview}</Text>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.back()}
              label="다른 영화 선택"
            />
          </VStack>

          <Card padding={4} maxWidth={960} width="100%">
            <HStack gap={3} align="end" wrap="wrap">
              <StackItem size="fill">
                <Selector
                  label="지역"
                  placeholder="지역 선택"
                  value={regionId}
                  onChange={handleRegionChange}
                  hasClear
                  options={regions.map((r) => ({ value: r.id, label: r.name }))}
                />
              </StackItem>
              <StackItem size="fill">
                <DateInput
                  label="날짜"
                  value={date as ISODate}
                  onChange={(v) => setDate(v || todayIso())}
                  min={todayIso() as ISODate}
                  placeholder="날짜 선택"
                />
              </StackItem>
              <StackItem>
                <Button
                  variant="primary"
                  size="lg"
                  isDisabled={!canSearch || loading}
                  isLoading={loading}
                  onClick={doSearch}
                  label="검색"
                />
              </StackItem>
            </HStack>
          </Card>

        </VStack>
      </VStack>

      {/* 결과 */}
      <Section padding={4}>
        {!searched ? (
          <EmptyState
            title="지역과 날짜를 선택하고 검색하세요"
            description="선택한 영화의 실시간 잔여 좌석을 CGV, 메가박스, 롯데시네마에서 한 번에 비교할 수 있어요."
          />
        ) : error ? (
          <Banner status="error" title="데이터 불러오기 실패" description={error}>
            <Button variant="secondary" onClick={doSearch} label="재시도" />
          </Banner>
        ) : loading ? (
          <VStack gap={4} align="center">
            <Spinner
              size="lg"
              label="영화관 사이트에서 실시간 좌석 정보를 수집하는 중..."
            />
          </VStack>
        ) : showtimes.length === 0 ? (
          <EmptyState
            title={`${dateLabel(date)} 상영 정보가 없습니다`}
            description="이 영화가 선택한 지역에서 상영하지 않을 수 있어요. 다른 지역이나 날짜로 다시 검색해 보세요."
          />
        ) : (
          <VStack gap={4}>
            <HStack gap={2} align="center" justify="between" wrap="wrap">
              <HStack gap={2} align="center" wrap="wrap">
                <Heading level={2} textWrap="balance">{dateLabel(date)} 상영 시간표</Heading>
                <Badge label={`${filtered.length}회차`} />
              </HStack>
              {crawledAt && (
                <Text type="supporting">
                  업데이트 {new Date(crawledAt).toLocaleTimeString("ko-KR")}
                </Text>
              )}
            </HStack>

            {availableCategories.length > 2 && (
              <HStack isScrollable maxWidth="100%">
                <SegmentedControl
                  value={screenFilter}
                  onChange={setScreenFilter}
                  label="스크린 타입"
                  layout="hug"
                  style={{ flexShrink: 0 }}
                >
                  {availableCategories.map((cat) => (
                    <SegmentedControlItem
                      key={cat.key}
                      value={cat.key}
                      label={cat.label}
                      style={{ whiteSpace: "nowrap" }}
                    />
                  ))}
                </SegmentedControl>
              </HStack>
            )}

            <HStack gap={2} align="center" justify="between" wrap="wrap">
              <Text type="supporting">
                영화관을 비교한 뒤 원하는 곳만 펼쳐 상세 회차를 확인하세요.
              </Text>
              <HStack isScrollable maxWidth="100%">
                <SegmentedControl
                  value={sortMode}
                  onChange={setSortMode}
                  label="영화관 정렬"
                  size="sm"
                  style={{ flexShrink: 0 }}
                >
                  <SegmentedControlItem
                    value="time"
                    label="빠른 시간순"
                    style={{ whiteSpace: "nowrap" }}
                  />
                  <SegmentedControlItem
                    value="seats"
                    label="좌석 여유순"
                    style={{ whiteSpace: "nowrap" }}
                  />
                  <SegmentedControlItem
                    value="name"
                    label="영화관순"
                    style={{ whiteSpace: "nowrap" }}
                  />
                </SegmentedControl>
              </HStack>
            </HStack>

            {groupedByTheater.length === 0 ? (
              <EmptyState
                title={`${SCREEN_CATEGORIES.find((c) => c.key === screenFilter)?.label || ""} 상영이 없습니다`}
                description="이 스크린 타입으로 상영하는 회차가 없어요. 다른 타입을 선택해 보세요."
              />
            ) : (
              groupedByTheater.map((group, index) => (
                <Card key={`${group.chain}-${group.name}`} padding={2}>
                  <Collapsible
                    defaultIsOpen={index === 0}
                    trigger={
                      <StackItem size="fill">
                        <VStack gap={3} padding={2} width="100%">
                            <HStack gap={2} align="center" width="100%">
                              <Badge variant={chainColor[group.chain]} label={group.chain} />
                              <StackItem size="fill">
                                <Heading level={3} maxLines={2} wordBreak="break-word" textWrap="pretty">
                                  {group.name}
                                </Heading>
                              </StackItem>
                            </HStack>
                            <HStack gap={1} align="center" wrap="wrap">
                              {group.screenTypes.slice(0, 3).map((type) => (
                                <Badge key={type} variant="gray" label={type} />
                              ))}
                            </HStack>
                            <HStack gap={3} align="center" justify="between" width="100%">
                              <VStack gap={0.5} align="start">
                                <Text type="supporting" textWrap="nowrap">첫 상영</Text>
                                <Text weight="semibold" textWrap="nowrap" hasTabularNumbers>
                                  {group.firstTime}
                                </Text>
                              </VStack>
                              <VStack gap={0.5} align="center">
                                <Text type="supporting" textWrap="nowrap">회차</Text>
                                <Text weight="semibold" textWrap="nowrap" hasTabularNumbers>
                                  {group.shows.length}회
                                </Text>
                              </VStack>
                              <VStack gap={0.5} align="end">
                                <Text type="supporting" textWrap="nowrap">최대 잔여</Text>
                                <Text weight="semibold" textWrap="nowrap" hasTabularNumbers>
                                  {group.maxRemaining}석
                                </Text>
                              </VStack>
                            </HStack>
                        </VStack>
                      </StackItem>
                    }
                  >
                    <VStack gap={3} padding={2}>
                      <ShowtimeGrid shows={group.shows} />
                    </VStack>
                  </Collapsible>
                </Card>
              ))
            )}
          </VStack>
        )}
      </Section>
    </AppFrame>
  );
}
