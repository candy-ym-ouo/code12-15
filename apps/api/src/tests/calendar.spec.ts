import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  aggregateDailyDensity,
  buildMonthGrid,
  daysInMonth,
  gridRangeOfMonth,
  gridStartOfMonth,
  nextMonth,
  previousMonth,
  weekdayOffset,
  type CalendarDensityRow,
} from "../lib/calendar";

describe("月历网格", () => {
  it("网格固定 6×7 且周一开头", () => {
    const grid = buildMonthGrid(2025, 3);
    expect(grid).toHaveLength(GRID_SIZE);
    // 2025-03-01 是周六；周一开头时，首格应为 2 月 24 日（周一）
    expect(grid[0].date).toBe("2025-02-24");
    expect(grid[0].inMonth).toBe(false);
    expect(grid[0].isWeekend).toBe(false);

    const mar1 = grid.find((cell) => cell.date === "2025-03-01");
    expect(mar1?.inMonth).toBe(true);
    expect(mar1?.isWeekend).toBe(true); // 周六
  });

  it("跨月补齐：3 月网格包含 2 月末与 4 月初，且补齐格标记 inMonth=false", () => {
    const grid = buildMonthGrid(2025, 3);
    const dates = grid.map((cell) => cell.date);
    expect(dates).toContain("2025-02-28");
    expect(dates).toContain("2025-04-06");
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    const last = grid[grid.length - 1];
    expect(last.date).toBe("2025-04-06");
    expect(last.inMonth).toBe(false);
  });

  it("平年 2 月只有 28 天，网格不凭空多出闰日", () => {
    expect(daysInMonth(2025, 2)).toBe(28);
    const grid = buildMonthGrid(2025, 2);
    expect(grid.some((cell) => cell.date === "2025-02-29")).toBe(false);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(28);
    // 2025-02-01 是周六
    expect(gridStartOfMonth(2025, 2)).toBe("2025-01-27");
    const range = gridRangeOfMonth(2025, 2);
    expect(range.from).toBe("2025-01-27");
    expect(range.to).toBe("2025-03-09");
  });

  it("闰年 2 月有 29 天，闰日落在正确的星期列", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    const grid = buildMonthGrid(2024, 2);
    const leap = grid.find((cell) => cell.date === "2024-02-29");
    expect(leap?.inMonth).toBe(true);
    // 2024-02-29 是周四（列索引 3）
    expect(weekdayOffset("2024-02-29")).toBe(3);
    expect(grid.indexOf(leap!) % 7).toBe(3);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(29);
  });

  it("年末/年初跨月导航正确", () => {
    expect(previousMonth(2025, 1)).toEqual({ year: 2024, month: 12 });
    expect(nextMonth(2025, 12)).toEqual({ year: 2026, month: 1 });
    expect(previousMonth(2024, 3)).toEqual({ year: 2024, month: 2 });
    expect(nextMonth(2024, 2)).toEqual({ year: 2024, month: 3 });
  });

  it("元旦与跨年补齐准确：2026 年 1 月网格", () => {
    // 2026-01-01 是周四
    const grid = buildMonthGrid(2026, 1);
    expect(grid[0].date).toBe("2025-12-29"); // 周一
    expect(grid[0].year).toBe(2025);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(grid[grid.length - 1].date).toBe("2026-02-08");
  });

  it("标记今天（按外部传入的当地日期）", () => {
    const grid = buildMonthGrid(2025, 3, { today: "2025-03-12" });
    const today = grid.find((cell) => cell.date === "2025-03-12");
    expect(today?.isToday).toBe(true);
    expect(grid.filter((cell) => cell.isToday)).toHaveLength(1);
  });

  it("非法年月抛错", () => {
    expect(() => buildMonthGrid(2025, 13)).toThrow();
    expect(() => buildMonthGrid(1800, 1)).toThrow();
  });
});

describe("每日密度聚合", () => {
  function row(overrides: Partial<CalendarDensityRow> & { observationDate: string }): CalendarDensityRow {
    return {
      siteId: "site-1",
      speciesId: "sp-1",
      phenophaseId: "ph-1",
      kind: "PLANT_PHENOLOGY",
      ...overrides,
    };
  }

  it("同日同地点/物种/阶段/类型的重复补录只落一个事件", () => {
    const density = aggregateDailyDensity([
      row({ observationDate: "2025-03-12" }),
      row({ observationDate: "2025-03-12", phenophaseId: "ph-1" }),
    ]);
    expect(density.get("2025-03-12")).toEqual({ eventCount: 1, observationCount: 2 });
  });

  it("同日不同物种/阶段/类型分别计为不同事件", () => {
    const density = aggregateDailyDensity([
      row({ observationDate: "2025-03-12", speciesId: "sp-1", phenophaseId: "ph-1" }),
      row({ observationDate: "2025-03-12", speciesId: "sp-2", phenophaseId: "ph-2" }),
      row({ observationDate: "2025-03-12", speciesId: null, phenophaseId: null, kind: "WEATHER_ANOMALY" }),
    ]);
    expect(density.get("2025-03-12")).toEqual({ eventCount: 3, observationCount: 3 });
  });

  it("不同日期分别落到各自桶里", () => {
    const density = aggregateDailyDensity([
      row({ observationDate: "2025-03-12" }),
      row({ observationDate: "2025-03-13" }),
      row({ observationDate: "2025-03-13" }),
    ]);
    expect(density.get("2025-03-12")).toEqual({ eventCount: 1, observationCount: 1 });
    expect(density.get("2025-03-13")).toEqual({ eventCount: 1, observationCount: 2 });
  });

  it("闰日记录落入 2024-02-29 且可被网格渲染", () => {
    const density = aggregateDailyDensity([row({ observationDate: "2024-02-29" })]);
    const grid = buildMonthGrid(2024, 2, { density });
    const cell = grid.find((item) => item.date === "2024-02-29");
    expect(cell?.eventCount).toBe(1);
    expect(cell?.observationCount).toBe(1);
  });

  it("非法日期字符串被忽略", () => {
    const density = aggregateDailyDensity([
      row({ observationDate: "not-a-date" }),
      row({ observationDate: "2025-02-30" }),
      row({ observationDate: "2025-03-12" }),
    ]);
    expect(density.size).toBe(1);
  });
});
