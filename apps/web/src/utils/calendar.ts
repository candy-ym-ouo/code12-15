/**
 * 月历网格工具（前端版，与后端 apps/api/src/lib/calendar.ts 同构）。
 * 一周从周一开始，固定 6×7；2 月按闰年规则返回 28/29 天。
 */

export const GRID_WEEKDAYS = 7;
export const GRID_WEEKS = 6;
export const GRID_SIZE = GRID_WEEKDAYS * GRID_WEEKS;
export const DAY_MS = 86_400_000;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_DAYS[month - 1];
}

function toUtcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcMs(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcDate(date).getTime() + days * DAY_MS);
}

/** 周一为 0 … 周日为 6。 */
export function weekdayOffset(date: string): number {
  return (toUtcDate(date).getUTCDay() + 6) % 7;
}

export function gridStartOfMonth(year: number, month: number): string {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return addDays(first, -weekdayOffset(first));
}

export type GridCellInput = { date: string; eventCount?: number; observationCount?: number; isToday?: boolean };

export type CalendarGridCell = {
  date: string;
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  eventCount: number;
  observationCount: number;
  isToday: boolean;
  isWeekend: boolean;
};

/** 生成 6×7 网格；density 通常直接来自 /stats/calendar 的 cells（已含补齐日）。 */
export function buildMonthGrid(
  year: number,
  month: number,
  options: { density?: Map<string, GridCellInput>; today?: string } = {},
): CalendarGridCell[] {
  const start = gridStartOfMonth(year, month);
  const density = options.density ?? new Map<string, GridCellInput>();

  return Array.from({ length: GRID_SIZE }, (_, index) => {
    const date = addDays(start, index);
    const [cellYear, cellMonth, cellDay] = date.split("-").map(Number);
    const item = density.get(date);
    const weekday = index % GRID_WEEKDAYS;
    return {
      date,
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      inMonth: cellMonth === month,
      eventCount: item?.eventCount ?? 0,
      observationCount: item?.observationCount ?? 0,
      isToday: options.today === date,
      isWeekend: weekday >= 5,
    };
  });
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function formatMonthTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}
