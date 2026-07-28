/** YYYYMMDD (메가박스/CGV용) */
export function dateCompact(d = new Date()): string {
  return dateIso(d).replaceAll("-", "");
}

/** YYYY-MM-DD (롯데시네마용, KST 기준) */
export function dateIso(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** KST 기준 "오늘" YYYY-MM-DD */
export function todayKst(): string {
  return dateIso(new Date());
}

/** KST 기준 N일 전 YYYYMMDD (KOFIC targetDt용) */
export function daysAgoKstCompact(days: number): string {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - 9); // UTC → KST 시각으로 변환
  d.setUTCDate(d.getUTCDate() - days);
  return dateCompact(d);
}

/** KST 자정의 타임스탬프 반환 (ms). 날짜 비교용. */
export function kstMidnight(dateStr: string): number {
  // "YYYY-MM-DD" → KST 자정 = UTC 전일 15:00
  return new Date(`${dateStr}T00:00:00+09:00`).getTime();
}
