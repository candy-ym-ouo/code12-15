import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CalendarGrid from "@/components/CalendarGrid.vue";
import { buildMonthMatrix, type DayKey } from "@/lib/calendar";

describe("CalendarGrid", () => {
  const matrix = buildMonthMatrix(2024, 2, 1);
  const counts = new Map<DayKey, number>([
    ["2024-02-01", 2],
    ["2024-02-29", 4],
  ]);

  const countForDay = (dayKey: DayKey) => counts.get(dayKey) ?? 0;
  const levelForDay = (dayKey: DayKey) => {
    const count = countForDay(dayKey);
    if (count === 0) return 0;
    return count >= 4 ? 4 : 1;
  };

  it("渲染周一起始表头与闰日标记", () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        weeks: matrix.weeks,
        countForDay,
        levelForDay,
        todayKey: "2024-02-20",
        selectedDayKey: null,
      },
    });

    expect(wrapper.text()).toContain("一");
    expect(wrapper.text()).toContain("日");

    const leapCell = wrapper
      .findAll("button[role='gridcell']")
      .find((cell) => cell.attributes("aria-label")?.startsWith("2024-02-29"));
    expect(leapCell?.text()).toContain("闰");
    expect(leapCell?.classes()).toContain("cell--leap");
  });

  it("跨月补位格置灰且不可点", () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        weeks: matrix.weeks,
        countForDay,
        levelForDay,
        todayKey: "2024-02-20",
        selectedDayKey: null,
      },
    });

    const spill = wrapper.findAll("button").find((cell) => cell.attributes("aria-label")?.startsWith("2024-01-29"));
    expect(spill?.attributes("disabled")).toBeDefined();
    expect(spill?.classes()).toContain("cell--muted");
  });

  it("点击本月日期触发 select，再点同一天取消选中", async () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        weeks: matrix.weeks,
        countForDay,
        levelForDay,
        todayKey: "2024-02-20",
        selectedDayKey: null,
      },
    });

    const target = wrapper.findAll("button").find((cell) => cell.attributes("aria-label")?.startsWith("2024-02-05"));
    await target?.trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["2024-02-05"]);
  });

  it("为今天与选中日添加状态类", () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        weeks: matrix.weeks,
        countForDay,
        levelForDay,
        todayKey: "2024-02-05",
        selectedDayKey: "2024-02-05",
      },
    });

    const target = wrapper.findAll("button").find((cell) => cell.attributes("aria-label")?.startsWith("2024-02-05"));
    expect(target?.classes()).toContain("cell--today");
    expect(target?.classes()).toContain("cell--selected");
  });
});
