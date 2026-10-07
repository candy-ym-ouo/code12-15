import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  addDays,
  buildMonthGrid,
  daysInMonth,
  gridStartOfMonth,
  nextMonth,
  previousMonth,
  weekdayOffset,
} from "../../src/utils/calendar";

describe("前端月历网格工具", () => {
  it("固定 42 格，周一开头，跨月补齐", () => {
    const grid = buildMonthGrid(2025, 3);
    expect(grid).toHaveLength(GRID_SIZE);
    expect(grid[0].date).toBe("2025-02-24");
    expect(grid[0].inMonth).toBe(false);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(grid[grid.length - 1].date).toBe("2025-04-06");
  });

  it("平/闰 2 月天数与闰日列位置正确", () => {
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(buildMonthGrid(2025, 2).some((cell) => cell.date === "2025-02-29")).toBe(false);

    const leapGrid = buildMonthGrid(2024, 2);
    const leap = leapGrid.find((cell) => cell.date === "2024-02-29");
    expect(leap?.inMonth).toBe(true);
    expect(weekdayOffset("2024-02-29")).toBe(3);
  });

  it("跨年导航与日期加减", () => {
    expect(previousMonth(2025, 1)).toEqual({ year: 2024, month: 12 });
    expect(nextMonth(2025, 12)).toEqual({ year: 2026, month: 1 });
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("网格起点周一计算（含元旦边界）", () => {
    expect(gridStartOfMonth(2026, 1)).toBe("2025-12-29");
    const grid = buildMonthGrid(2026, 1, { today: "2026-01-01" });
    expect(grid.find((cell) => cell.date === "2026-01-01")?.isToday).toBe(true);
  });

  it("密度映射到对应日期，缺失日期为 0", () => {
    const density = new Map([
      ["2025-03-12", { date: "2025-03-12", eventCount: 3, observationCount: 4 }],
      ["2025-02-28", { date: "2025-02-28", eventCount: 1, observationCount: 1 }],
    ]);
    const grid = buildMonthGrid(2025, 3, { density });
    expect(grid.find((cell) => cell.date === "2025-03-12")?.eventCount).toBe(3);
    expect(grid.find((cell) => cell.date === "2025-02-28")?.observationCount).toBe(1);
    expect(grid.find((cell) => cell.date === "2025-03-13")?.eventCount).toBe(0);
  });
});
