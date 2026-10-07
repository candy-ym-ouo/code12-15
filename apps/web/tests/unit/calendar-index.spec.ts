import { describe, expect, it } from "vitest";
import type { Observation } from "@/types/models";
import {
  buildCalendarIndex,
  countOnDay,
  densityLevel,
  eventSignature,
  maxCountInMonth,
  observationsOnDay,
  resolveDayKey,
} from "@/lib/calendarIndex";

let seq = 0;

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  seq += 1;
  return {
    id: overrides.id ?? `obs-${seq}`,
    kind: "PLANT_PHENOLOGY",
    status: "PUBLISHED",
    observationDate: "2024-03-12",
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
    createdAt: "2024-03-12T00:00:00.000Z",
    updatedAt: "2024-03-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("calendarIndex：同日补录去重", () => {
  it("同地点同日同类型同物种同阶段的重复补录只落一条，保留最早补录", () => {
    const base = {
      observationDate: "2024-03-12",
      site: { id: "site-1", name: "测试点", latitude: null, longitude: null },
      kind: "PLANT_PHENOLOGY" as const,
      species: { id: "sp-1", commonName: "银杏", category: "PLANT" as const, scientificName: null },
      phenophase: { id: "ph-1", name: "发芽", color: "#000" },
    };
    const index = buildCalendarIndex(
      [
        makeObservation({ ...base, id: "later", createdAt: "2024-03-15T09:00:00.000Z" }),
        makeObservation({ ...base, id: "earliest", createdAt: "2024-03-13T09:00:00.000Z" }),
      ],
      "Asia/Shanghai",
    );

    expect(countOnDay(index, "2024-03-12")).toBe(1);
    expect(index.byDay.get("2024-03-12")?.[0].id).toBe("earliest");
    expect(index.mergedDuplicates).toBe(1);
  });

  it("不同物候阶段不算重复；不同物种/地点也不合并", () => {
    const siteA = { id: "site-1", name: "甲", latitude: null, longitude: null };
    const siteB = { id: "site-2", name: "乙", latitude: null, longitude: null };
    const species = { id: "sp-1", commonName: "银杏", category: "PLANT" as const, scientificName: null };
    const index = buildCalendarIndex(
      [
        makeObservation({ id: "a", site: siteA, species, phenophase: { id: "ph-1", name: "发芽", color: "#1" } }),
        makeObservation({ id: "b", site: siteA, species, phenophase: { id: "ph-2", name: "展叶", color: "#2" } }),
        makeObservation({ id: "c", site: siteB, species, phenophase: { id: "ph-1", name: "发芽", color: "#1" } }),
      ],
      "Asia/Shanghai",
    );

    expect(countOnDay(index, "2024-03-12")).toBe(3);
    expect(index.mergedDuplicates).toBe(0);
  });

  it("签名稳定且区分物种为空的天气类记录", () => {
    const weather = makeObservation({
      id: "w",
      kind: "WEATHER_ANOMALY",
      anomalyType: "HEAT_WAVE",
      site: { id: "site-1", name: "甲", latitude: null, longitude: null },
    });
    const plant = makeObservation({ id: "p", site: { id: "site-1", name: "甲", latitude: null, longitude: null } });
    expect(eventSignature(weather)).not.toBe(eventSignature(plant));
    // 两条同地点同日的热浪记录仍算重复
    const index = buildCalendarIndex([weather, makeObservation({ id: "w2", kind: "WEATHER_ANOMALY" })], "Asia/Shanghai");
    expect(index.mergedDuplicates).toBe(1);
  });

  it("草稿不参与密度统计", () => {
    const index = buildCalendarIndex(
      [
        makeObservation({ id: "pub" }),
        makeObservation({ id: "draft", status: "DRAFT" }),
      ],
      "Asia/Shanghai",
    );
    expect(countOnDay(index, "2024-03-12")).toBe(1);
  });
});

describe("calendarIndex：跨月与闰日归日", () => {
  it("闰日单独成桶，与 2 月 28 日互不干扰", () => {
    const index = buildCalendarIndex(
      [
        makeObservation({ id: "a", observationDate: "2024-02-28" }),
        makeObservation({ id: "b", observationDate: "2024-02-29" }),
        makeObservation({ id: "c", observationDate: "2024-03-01" }),
      ],
      "Asia/Shanghai",
    );
    expect(countOnDay(index, "2024-02-28")).toBe(1);
    expect(countOnDay(index, "2024-02-29")).toBe(1);
    expect(countOnDay(index, "2024-03-01")).toBe(1);
    expect(maxCountInMonth(index, 2024, 2)).toBe(1);
  });

  it("observationDate 缺失时按用户时区从瞬间归日（跨月边界）", () => {
    const index = buildCalendarIndex(
      [
        makeObservation({
          id: "utc-midnight",
          observationDate: "" as unknown as string,
          observedAt: "2024-04-01T00:30:00.000Z",
          createdAt: "2024-04-01T00:30:00.000Z",
        }),
      ],
      "Asia/Shanghai",
    );
    expect([...index.byDay.keys()]).toEqual(["2024-04-01"]);

    const ny = buildCalendarIndex(
      [
        makeObservation({
          id: "ny",
          observationDate: "" as unknown as string,
          observedAt: "2024-04-01T00:30:00.000Z",
          createdAt: "2024-04-01T00:30:00.000Z",
        }),
      ],
      "America/New_York",
    );
    expect([...ny.byDay.keys()]).toEqual(["2024-03-31"]);
  });

  it("resolveDayKey 依次回退 observationDate -> observedAt -> createdAt", () => {
    expect(resolveDayKey(makeObservation({ observationDate: "2024-05-05" }), "UTC")).toBe("2024-05-05");
    expect(
      resolveDayKey(
        makeObservation({
          observationDate: "" as unknown as string,
          observedAt: "2024-05-05T20:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        }),
        "Asia/Shanghai",
      ),
    ).toBe("2024-05-06");
    expect(
      resolveDayKey(
        makeObservation({
          observationDate: "" as unknown as string,
          observedAt: null,
          createdAt: "2024-05-05T20:00:00.000Z",
        }),
        "Asia/Shanghai",
      ),
    ).toBe("2024-05-06");
  });
});

describe("calendarIndex：密度分档", () => {
  it("以当月峰值线性归一到 1-4 档", () => {
    expect(densityLevel(0, 8)).toBe(0);
    expect(densityLevel(2, 8)).toBe(1); // ceil(2/8*4)=1
    expect(densityLevel(4, 8)).toBe(2);
    expect(densityLevel(6, 8)).toBe(3);
    expect(densityLevel(8, 8)).toBe(4);
  });

  it("峰值为 1 时有数据即 1 档，不出现空档跳变", () => {
    expect(densityLevel(1, 1)).toBe(1);
    expect(densityLevel(0, 0)).toBe(0);
  });

  it("maxCountInMonth 只统计该月日期", () => {
    const index = buildCalendarIndex(
      [
        makeObservation({ id: "a", observationDate: "2024-03-30" }),
        makeObservation({ id: "b", observationDate: "2024-03-30", species: { id: "x", commonName: "x", category: "PLANT", scientificName: null } }),
        makeObservation({ id: "c", observationDate: "2024-04-01" }),
      ],
      "Asia/Shanghai",
    );
    expect(maxCountInMonth(index, 2024, 3)).toBe(2);
    expect(maxCountInMonth(index, 2024, 4)).toBe(1);
  });
});

describe("calendarIndex：当日记录", () => {
  it("observationsOnDay 仅返回该日并按时间排序", () => {
    const index = buildCalendarIndex(
      [
        makeObservation({ id: "late", observedAt: "2024-03-12T08:00:00.000Z" }),
        makeObservation({ id: "early", observedAt: "2024-03-12T01:00:00.000Z", species: { id: "s", commonName: "s", category: "BIRD", scientificName: null }, kind: "BIRD_SOUND" }),
        makeObservation({ id: "other-day", observationDate: "2024-03-13" }),
      ],
      "UTC",
    );
    const day = observationsOnDay(index, "2024-03-12");
    expect(day.map((item) => item.id)).toEqual(["early", "late"]);
    expect(observationsOnDay(index, "2024-03-15")).toEqual([]);
  });
});
