import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const listMock = vi.fn();

vi.mock("@/api", () => ({
  observationApi: {
    list: (...args: unknown[]) => listMock(...args),
  },
}));

import { useCalendarStore } from "@/stores/calendar";
import type { Observation } from "@/types/models";

function makeObservation(id: string, date: string): Observation {
  return {
    id,
    kind: "PLANT_PHENOLOGY",
    status: "PUBLISHED",
    observationDate: date,
    observedAt: null,
    title: null,
    notes: null,
    temperatureC: null,
    precipitationMm: null,
    windLevel: null,
    humidityPct: null,
    anomalyType: null,
    anomalySeverity: null,
    impactNotes: null,
    source: "MANUAL",
    site: { id: "site-1", name: "测试点", latitude: null, longitude: null },
    species: null,
    phenophase: null,
    photos: [],
    tags: [],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

describe("calendar store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listMock.mockReset();
  });

  it("按网格窗口（含跨月补位）拉取并自动翻页", async () => {
    // 固定到 2024 年 2 月：窗口 2024-01-29 ~ 2024-03-03（周一起始）
    const store = useCalendarStore();
    store.timeZone = "Asia/Shanghai";
    store.yearMonth = { year: 2024, month: 2 };

    listMock
      .mockResolvedValueOnce({
        items: [makeObservation("a", "2024-02-01"), makeObservation("b", "2024-02-29")],
        meta: { hasMore: true, nextCursor: "cursor-1" },
      })
      .mockResolvedValueOnce({
        items: [makeObservation("c", "2024-03-01")],
        meta: { hasMore: false, nextCursor: null },
      });

    await store.loadMonth();

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(listMock.mock.calls[0][0]).toMatchObject({
      from: "2024-01-29",
      to: "2024-03-03",
      status: "PUBLISHED",
      sort: "date_asc",
      limit: 50,
      cursor: null,
    });
    expect(listMock.mock.calls[1][0].cursor).toBe("cursor-1");

    expect(store.observations).toHaveLength(3);
    expect(store.countForDay("2024-02-01")).toBe(1);
    expect(store.countForDay("2024-02-29")).toBe(1);
    // 3 月 1 日是补位格，但数据已在窗口内，计数可用
    expect(store.countForDay("2024-03-01")).toBe(1);
    expect(store.monthTotal).toBe(2);
    expect(store.loaded).toBe(true);
  });

  it("翻月时重置选中日并重新加载", async () => {
    const store = useCalendarStore();
    store.timeZone = "Asia/Shanghai";
    store.yearMonth = { year: 2024, month: 2 };
    listMock.mockResolvedValue({ items: [], meta: { hasMore: false, nextCursor: null } });

    store.selectDay("2024-02-10");
    store.goPrevMonth();
    expect(store.yearMonth).toEqual({ year: 2024, month: 1 });
    expect(store.selectedDayKey).toBeNull();
    await Promise.resolve();
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock.mock.calls[0][0]).toMatchObject({ from: "2024-01-01", to: "2024-02-04" });
  });

  it("切换时区后按新时区归日", async () => {
    const store = useCalendarStore();
    store.timeZone = "Asia/Shanghai";
    store.yearMonth = { year: 2024, month: 3 };

    listMock.mockResolvedValue({
      items: [
        makeObservation("x", "2024-03-09"),
      ],
      meta: { hasMore: false, nextCursor: null },
    });

    listMock.mockClear();
    listMock.mockResolvedValue({
      items: [
        {
          ...makeObservation("z", "1970-01-01"),
          observationDate: "",
          observedAt: "2024-03-10T02:30:00.000Z",
        },
      ],
      meta: { hasMore: false, nextCursor: null },
    });

    store.timeZone = "UTC";
    store.yearMonth = { year: 2024, month: 3 };

    store.setTimeZone("Asia/Shanghai");
    await Promise.resolve();
    await Promise.resolve();
    expect(store.countForDay("2024-03-10")).toBe(1);

    store.setTimeZone("America/New_York");
    await Promise.resolve();
    await Promise.resolve();
    expect(store.countForDay("2024-03-10")).toBe(0);
    expect(store.countForDay("2024-03-09")).toBe(1);
  });
});
