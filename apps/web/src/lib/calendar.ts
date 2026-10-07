/**
 * 物候日历内核：与框架无关的纯日期工具。
 *
 * 日历日统一用 `YYYY-MM-DD`（站点/用户本地日历日）表示，
 * 时区只参与两件事：
 *   1. 判断一个 UTC 瞬间属于哪个日历日（dayKeyFromInstant）；
 *   2. 判断"今天"（dayKeyInTimezone）。
 *
 * 所有跨月、跨年、闰年运算都走 UTC 分量的 Date 运算，
 * 因此没有时区/DST 漂移，也不依赖任何闰年表。
 */

export type DayKey = string;
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = 周日

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export interface CalendarCell {
  /** 该格子对应的日历日。 */
  dayKey: DayKey;
  year: number;
  month: number;
  day: number;
  /** 是否属于当前展示月份（false 表示上月/下月的补位格）。 */
  inMonth: boolean;
  /** ISO 星期几，1=周一 … 7=周日。 */
  isoWeekday: number;
  isLeapDay: boolean;
}

export interface MonthMatrix {
  year: number;
  month: number;
  weeks: CalendarCell[][];
}

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1];
}

/** 解析并严格校验 YYYY-MM-DD（拒绝 02-30 这类不存在的日期）。 */
export function parseDayKey(dayKey: DayKey): { year: number; month: number; day: number } {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) throw new Error(`非法日历日：${dayKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`非法日历日：${dayKey}`);
  }
  return { year, month, day };
}

export function isValidDayKey(dayKey: unknown): dayKey is DayKey {
  return typeof dayKey === "string" && DAY_KEY_PATTERN.test(dayKey)
    && (() => {
      try {
        parseDayKey(dayKey);
        return true;
      } catch {
        return false;
      }
    })();
}

export function buildDayKey(year: number, month: number, day: number): DayKey {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // 让补位计算里的溢出（如 2 月 31 日）立刻暴露，而不是静默进位。
  parseDayKey(value);
  return value;
}

/** 日历日加减天数，溢出由 Date 的 UTC 分量归一化（自动处理月末/年末/闰年）。 */
export function addDays(dayKey: DayKey, days: number): DayKey {
  const { year, month, day } = parseDayKey(dayKey);
  const next = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return buildDayKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function addMonths(yearMonth: YearMonth, delta: number): YearMonth {
  const shifted = yearMonth.month - 1 + delta;
  return {
    year: yearMonth.year + Math.floor(shifted / 12),
    month: (((shifted % 12) + 12) % 12) + 1,
  };
}

/** ISO 星期几：周一 1 … 周日 7。 */
export function isoWeekdayOf(dayKey: DayKey): number {
  const { year, month, day } = parseDayKey(dayKey);
  const jsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 周日 0 … 周六 6
  return jsWeekday === 0 ? 7 : jsWeekday;
}

/** 某时区下，一个 UTC 瞬间对应的日历日（YYYY-MM-DD）。 */
export function dayKeyFromInstant(instant: Date | string | number, timeZone: string): DayKey {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function dayKeyInTimezone(timeZone: string, now: Date = new Date()): DayKey {
  return dayKeyFromInstant(now, timeZone);
}

export function isLeapDay(dayKey: DayKey): boolean {
  const { month, day } = parseDayKey(dayKey);
  return month === 2 && day === 29;
}

/**
 * 生成月历网格：每周一行，周一到周日（可配置 weekStartsOn），
 * 前后用相邻月份的日期补齐到整周，因此天然覆盖"跨月边界"。
 */
export function buildMonthMatrix(year: number, month: number, weekStartsOn: WeekStartsOn = 1): MonthMatrix {
  if (month < 1 || month > 12) throw new Error(`非法月份：${month}`);
  if (weekStartsOn < 0 || weekStartsOn > 6) throw new Error(`非法周起始：${weekStartsOn}`);

  const first = buildDayKey(year, month, 1);
  // JS 星期（周日 0…周六 6）转换为相对 weekStartsOn 的列偏移。
  const firstJsWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = (firstJsWeekday - weekStartsOn + 7) % 7;

  const gridStart = addDays(first, -lead);
  const total = daysInMonth(year, month);
  const rows = Math.ceil((lead + total) / 7);

  const weeks: CalendarCell[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const week: CalendarCell[] = [];
    for (let column = 0; column < 7; column += 1) {
      const dayKey = addDays(gridStart, row * 7 + column);
      const parts = parseDayKey(dayKey);
      week.push({
        dayKey,
        year: parts.year,
        month: parts.month,
        day: parts.day,
        inMonth: parts.month === month && parts.year === year,
        isoWeekday: isoWeekdayOf(dayKey),
        isLeapDay: parts.month === 2 && parts.day === 29,
      });
    }
    weeks.push(week);
  }

  return { year, month, weeks };
}

/** 网格覆盖到的日历日范围（含前后补位），用于一次性拉取展示所需数据。 */
export function matrixWindow(matrix: MonthMatrix): { from: DayKey; to: DayKey } {
  const firstWeek = matrix.weeks[0];
  const lastWeek = matrix.weeks[matrix.weeks.length - 1];
  return {
    from: firstWeek[0].dayKey,
    to: lastWeek[lastWeek.length - 1].dayKey,
  };
}

/** 网格内属于当前月份的格子。 */
export function cellsInMonth(matrix: MonthMatrix): CalendarCell[] {
  return matrix.weeks.flat().filter((cell) => cell.inMonth);
}

export function formatYearMonth(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

/** 某时区当前相对 UTC 的偏移文本，如 "UTC+08:00"。 */
export function timezoneOffsetLabel(timeZone: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const name = formatter
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  // longOffset 形如 "GMT+08:00" / "GMT"（UTC 本身）
  if (name === "GMT") return "UTC+00:00";
  return name.replace("GMT", "UTC");
}
