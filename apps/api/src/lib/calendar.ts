import { addDays, isLeapYear, parseDateString } from "./date";

/** 一周从周一开始（中文日历习惯），grid 固定 6 行 7 列。 */
export const GRID_WEEKDAYS = 7;
export const GRID_WEEKS = 6;
export const GRID_SIZE = GRID_WEEKDAYS * GRID_WEEKS;

/** 以周一为一周起点时，某天在日历网格中的列偏移：周一 0 … 周日 6。 */
export function weekdayOffset(date: string): number {
  const parsed = parseDateString(date);
  if (!parsed) throw new Error(`非法日期字符串：${date}`);
  // Date.UTC 下 getUTCDay：周日 0 … 周六 6
  const jsDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return (jsDay + 6) % 7;
}

/** 某月 1 日所在网格周的周一日期（可能落在上个月）。 */
export function gridStartOfMonth(year: number, month: number): string {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return addDays(first, -weekdayOffset(first));
}

export type CalendarCell = {
  date: string;
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  /** 该日去重后的物候事件数（同一地点/物种/阶段/类型只算一条）。 */
  eventCount: number;
  /** 该日命中筛选条件的原始已发布记录条数（同日重复补录会 >1）。 */
  observationCount: number;
  isToday: boolean;
  isWeekend: boolean;
};

/**
 * 生成某月的 6×7 日历网格，首尾用相邻月份补齐，保证跨月边界准确：
 * - 2 月（平/闰）、大小月、元旦前后都不会多格、少格或错列；
 * - 补齐格的 inMonth=false，日期本身仍可落入密度数据（例如 3 月 1 日恰在 2 月网格末尾）。
 */
export function buildMonthGrid(
  year: number,
  month: number,
  options: {
    density?: Map<string, { eventCount: number; observationCount: number }>;
    today?: string;
  } = {},
): CalendarCell[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new Error(`年份超出范围：${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`月份超出范围：${month}`);
  }

  const start = gridStartOfMonth(year, month);
  const density = options.density ?? new Map<string, { eventCount: number; observationCount: number }>();

  return Array.from({ length: GRID_SIZE }, (_, index) => {
    const date = addDays(start, index);
    const parsed = parseDateString(date) as { year: number; month: number; day: number };
    const day = density.get(date);
    const weekday = (index % GRID_WEEKDAYS) as number;
    return {
      date,
      year: parsed.year,
      month: parsed.month,
      day: parsed.day,
      inMonth: parsed.month === month,
      eventCount: day?.eventCount ?? 0,
      observationCount: day?.observationCount ?? 0,
      isToday: options.today === date,
      isWeekend: weekday >= 5,
    };
  });
}

/** 某月日历网格实际覆盖的日期区间 [from, to]（含相邻月份补齐格）。 */
export function gridRangeOfMonth(year: number, month: number): { from: string; to: string } {
  const from = gridStartOfMonth(year, month);
  return { from, to: addDays(from, GRID_SIZE - 1) };
}

/** 上一个月（自动处理跨年，如 2025-01 → 2024-12）。 */
export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** 下一个月（自动处理跨年，如 2025-12 → 2026-01）。 */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export type CalendarDensityRow = {
  observationDate: string;
  siteId: string | null;
  speciesId: string | null;
  phenophaseId: string | null;
  kind: string;
};

/**
 * 把已发布记录按「日历日 + 物候事件」聚合成密度。
 * 同一自然日的重复补录（地点 + 物种 + 物候阶段 + 观测类型相同）只落一个事件，
 * observationCount 保留原始条数，便于在界面提示"当天有 N 条记录、M 个事件"。
 */
export function aggregateDailyDensity(
  rows: CalendarDensityRow[],
): Map<string, { eventCount: number; observationCount: number }> {
  const result = new Map<string, { eventKeys: Set<string>; observationCount: number }>();

  for (const row of rows) {
    if (!parseDateString(row.observationDate)) continue;
    const bucket = result.get(row.observationDate) ?? { eventKeys: new Set<string>(), observationCount: 0 };
    bucket.observationCount += 1;
    bucket.eventKeys.add(
      [
        row.siteId ?? "",
        row.speciesId ?? "",
        row.phenophaseId ?? "",
        row.kind,
        // 日期已隐含在 map 的 key 中，不进入事件 key
      ].join("|"),
    );
    result.set(row.observationDate, bucket);
  }

  return new Map(
    [...result.entries()].map(([date, bucket]) => [
      date,
      { eventCount: bucket.eventKeys.size, observationCount: bucket.observationCount },
    ]),
  );
}

/** 当月天数（2 月按闰年规则返回 28/29）。 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
