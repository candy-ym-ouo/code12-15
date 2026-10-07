import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  buildDayKey,
  buildMonthMatrix,
  cellsInMonth,
  dayKeyFromInstant,
  dayKeyInTimezone,
  daysInMonth,
  isLeapDay,
  isLeapYear,
  isoWeekdayOf,
  matrixWindow,
  parseDayKey,
  timezoneOffsetLabel,
} from "@/lib/calendar";

describe("calendar 内核：闰年与闰日", () => {
  it("按 400 年规则判定闰年", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // 能被 100 整除但不能被 400 整除
    expect(isLeapYear(2000)).toBe(true);
  });

  it("二月天数在 28/29 间正确切换", () => {
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2024, 4)).toBe(30);
  });

  it("拒绝不存在的日期，但接受闰日", () => {
    expect(() => parseDayKey("2023-02-29")).toThrow();
    expect(() => parseDayKey("2024-02-29")).not.toThrow();
    expect(() => parseDayKey("2024-13-01")).toThrow();
    expect(isLeapDay("2024-02-29")).toBe(true);
    expect(isLeapDay("2024-02-28")).toBe(false);
  });

  it("闰日加减一天在跨月边界正确", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
  });
});

describe("calendar 内核：月历网格与跨月边界", () => {
  it("2024 年 2 月（闰年）周一起始，5 行、29 个本月格，补位落在 1 月末与 3 月初", () => {
    const matrix = buildMonthMatrix(2024, 2, 1);
    expect(matrix.weeks).toHaveLength(5);
    expect(matrix.weeks[0][0].dayKey).toBe("2024-01-29");
    expect(matrix.weeks[0][0].inMonth).toBe(false);

    const lastWeek = matrix.weeks[matrix.weeks.length - 1];
    expect(lastWeek[lastWeek.length - 1].dayKey).toBe("2024-03-03");
    expect(lastWeek[lastWeek.length - 1].inMonth).toBe(false);

    const inMonth = cellsInMonth(matrix);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[0].dayKey).toBe("2024-02-01");
    expect(inMonth[inMonth.length - 1].dayKey).toBe("2024-02-29");
    expect(inMonth.find((cell) => cell.isLeapDay)?.dayKey).toBe("2024-02-29");

    const window = matrixWindow(matrix);
    expect(window).toEqual({ from: "2024-01-29", to: "2024-03-03" });
  });

  it("2025 年 1 月网格的补位跨年到 2024 年 12 月", () => {
    const matrix = buildMonthMatrix(2025, 1, 1);
    expect(matrix.weeks[0][0].dayKey).toBe("2024-12-30");
    const lastWeek = matrix.weeks[matrix.weeks.length - 1];
    expect(lastWeek[lastWeek.length - 1].dayKey).toBe("2025-02-02");
    expect(cellsInMonth(matrix)).toHaveLength(31);
  });

  it("周一起始时每行严格为周一到周日", () => {
    const matrix = buildMonthMatrix(2024, 2, 1);
    for (const week of matrix.weeks) {
      expect(week.map((cell) => cell.isoWeekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("支持周日起始", () => {
    const matrix = buildMonthMatrix(2024, 2, 0);
    expect(matrix.weeks).toHaveLength(5);
    expect(matrix.weeks[0][0].dayKey).toBe("2024-01-28");
    const lastWeek = matrix.weeks[matrix.weeks.length - 1];
    expect(lastWeek[lastWeek.length - 1].dayKey).toBe("2024-03-02");
  });

  it("需要 6 行的月份也正确（2025 年 3 月，周六起且 31 天，周一起始）", () => {
    const matrix = buildMonthMatrix(2025, 3, 1);
    expect(matrix.weeks).toHaveLength(6);
    expect(matrix.weeks[0][0].dayKey).toBe("2025-02-24");
    const lastWeek = matrix.weeks[matrix.weeks.length - 1];
    expect(lastWeek[lastWeek.length - 1].dayKey).toBe("2025-04-06");
    expect(cellsInMonth(matrix)).toHaveLength(31);
  });

  it("星期几计算正确（2024-03-01 是周五）", () => {
    expect(isoWeekdayOf("2024-03-01")).toBe(5);
    expect(isoWeekdayOf("2024-03-03")).toBe(7); // 周日
    expect(isoWeekdayOf("2024-03-04")).toBe(1); // 周一
  });
});

describe("calendar 内核：月份与日期运算", () => {
  it("addMonths 正确处理跨年与负向偏移", () => {
    expect(addMonths({ year: 2024, month: 1 }, 1)).toEqual({ year: 2024, month: 2 });
    expect(addMonths({ year: 2024, month: 12 }, 1)).toEqual({ year: 2025, month: 1 });
    expect(addMonths({ year: 2024, month: 3 }, -5)).toEqual({ year: 2023, month: 10 });
    expect(addMonths({ year: 2024, month: 1 }, -12)).toEqual({ year: 2023, month: 1 });
  });

  it("buildDayKey 拒绝溢出日期", () => {
    expect(() => buildDayKey(2024, 2, 31)).toThrow();
    expect(buildDayKey(2024, 2, 29)).toBe("2024-02-29");
  });
});

describe("calendar 内核：时区归日", () => {
  it("同一 UTC 瞬间在不同时区落到不同日历日", () => {
    // 2024-03-10T02:30Z：上海已是 3 月 10 日上午，纽约仍是 3 月 9 日晚。
    const instant = new Date("2024-03-10T02:30:00.000Z");
    expect(dayKeyFromInstant(instant, "Asia/Shanghai")).toBe("2024-03-10");
    expect(dayKeyFromInstant(instant, "UTC")).toBe("2024-03-10");
    expect(dayKeyFromInstant(instant, "America/New_York")).toBe("2024-03-09");
    expect(dayKeyFromInstant(instant, "America/Los_Angeles")).toBe("2024-03-09");
  });

  it("DST 切换日仍能稳定归日（纽约春跳 2024-03-10）", () => {
    expect(dayKeyFromInstant(new Date("2024-03-10T06:59:00Z"), "America/New_York")).toBe("2024-03-10");
    expect(dayKeyFromInstant(new Date("2024-03-10T07:00:00Z"), "America/New_York")).toBe("2024-03-10");
    expect(dayKeyFromInstant(new Date("2024-11-03T06:30:00Z"), "America/New_York")).toBe("2024-11-03");
  });

  it("dayKeyInTimezone 返回合法日历日", () => {
    const key = dayKeyInTimezone("Asia/Shanghai", new Date("2024-06-01T20:00:00Z"));
    expect(key).toBe("2024-06-02");
  });

  it("时区偏移标签可读", () => {
    expect(timezoneOffsetLabel("UTC", new Date("2024-01-01T00:00:00Z"))).toBe("UTC+00:00");
    expect(timezoneOffsetLabel("Asia/Shanghai", new Date("2024-01-01T00:00:00Z"))).toBe("UTC+08:00");
  });
});
