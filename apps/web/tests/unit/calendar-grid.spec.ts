import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CalendarGrid from "@/components/CalendarGrid.vue";
import type { CalendarCell } from "@/types/models";

function makeCells(): CalendarCell[] {
  // 复用 2025-03 的 6×7 布局：2025-02-24（周一）起 42 格
  const start = new Date(Date.UTC(2025, 1, 24));
  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const d = new Date(start.getTime() + index * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    const month = d.getUTCMonth() + 1;
    cells.push({
      date,
      year: d.getUTCFullYear(),
      month,
      day: d.getUTCDate(),
      inMonth: month === 3,
      eventCount: 0,
      observationCount: 0,
      isToday: date === "2025-03-12",
      isWeekend: index % 7 >= 5,
    });
  }
  const set = (date: string, eventCount: number, observationCount: number) => {
    const cell = cells.find((item) => item.date === date);
    if (cell) {
      cell.eventCount = eventCount;
      cell.observationCount = observationCount;
    }
  };
  set("2025-03-12", 1, 2); // 同日重复补录
  set("2025-03-13", 3, 3);
  set("2025-03-14", 4, 4);
  return cells;
}

describe("CalendarGrid", () => {
  it("渲染 42 个日期格与工作日表头", () => {
    const wrapper = mount(CalendarGrid, { props: { cells: makeCells(), selectedDate: null } });
    expect(wrapper.findAll(".calendar-cell")).toHaveLength(42);
    expect(wrapper.text()).toContain("一");
    expect(wrapper.text()).toContain("日");
  });

  it("展示每日事件密度，重复补录只显示事件数但保留提示", () => {
    const wrapper = mount(CalendarGrid, { props: { cells: makeCells(), selectedDate: null } });
    const day12 = wrapper.findAll(".calendar-cell").find((cell) => cell.attributes("aria-label")?.startsWith("2025-03-12"));
    expect(day12?.text()).toContain("1");
    expect(day12?.attributes("aria-label")).toContain("1 个物候事件");
    expect(day12?.attributes("aria-label")).toContain("2 条记录");
    expect(day12?.find(".calendar-cell__repeat").exists()).toBe(true);
  });

  it("高亮今天并在点击时抛出 select 事件", async () => {
    const wrapper = mount(CalendarGrid, { props: { cells: makeCells(), selectedDate: null } });
    const today = wrapper.findAll(".calendar-cell").find((cell) => cell.classes("is-today"));
    expect(today?.attributes("aria-current")).toBe("date");

    await today?.trigger("click");
    const emitted = wrapper.emitted("select");
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({ date: "2025-03-12" });
  });

  it("补齐相邻月份的格子带 is-outside 标记", () => {
    const wrapper = mount(CalendarGrid, { props: { cells: makeCells(), selectedDate: null } });
    const outside = wrapper.findAll(".calendar-cell.is-outside");
    expect(outside.length).toBe(11); // 42 - 31
  });
});
