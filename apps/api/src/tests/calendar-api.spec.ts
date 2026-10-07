import { beforeEach, describe, expect, it } from "vitest";
import { createSite, createSpeciesWithPhase, registerUser, resetDatabase } from "./helpers/db";

describe("物候日历接口", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function record(
    user: Awaited<ReturnType<typeof registerUser>>,
    payload: Record<string, unknown>,
    allowDuplicate = false,
  ) {
    const response = await user.agent
      .post("/api/v1/observations")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ ...payload, ...(allowDuplicate ? { allowDuplicate: true } : {}) });
    expect(response.status).toBe(201);
    return response;
  }

  it("返回 6×7 网格，补齐格标记 inMonth=false，日期落在周一开头", async () => {
    const user = await registerUser();
    const response = await user.agent
      .get("/api/v1/stats/calendar?year=2025&month=3")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(200);
    const body = response.body.data;
    expect(body.year).toBe(2025);
    expect(body.month).toBe(3);
    expect(body.timezone).toBe("Asia/Shanghai");
    expect(body.cells).toHaveLength(42);
    expect(body.cells[0]).toMatchObject({ date: "2025-02-24", inMonth: false });
    expect(body.cells.filter((cell: { inMonth: boolean }) => cell.inMonth)).toHaveLength(31);
    expect(body.grid).toEqual({ from: "2025-02-24", to: "2025-04-06" });
  });

  it("同日重复补录只落一个事件，但保留原始条数", async () => {
    const user = await registerUser();
    const site = await createSite(user.id);
    const { speciesId, phenophaseId } = await createSpeciesWithPhase(user.id);

    const payload = {
      siteId: site.id,
      speciesId,
      phenophaseId,
      kind: "PLANT_PHENOLOGY",
      observationDate: "2025-03-12",
    };
    await record(user, payload);
    await record(user, payload, true);
    // 另一个物种同日记录，算第二个事件
    const second = await createSpeciesWithPhase(user.id, { commonName: "槐树", phaseName: "展叶" });
    await record(user, { ...payload, speciesId: second.speciesId, phenophaseId: second.phenophaseId });

    const response = await user.agent
      .get(`/api/v1/stats/calendar?year=2025&month=3&siteId=${site.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const cell = response.body.data.cells.find((item: { date: string }) => item.date === "2025-03-12");
    expect(cell.eventCount).toBe(2);
    expect(cell.observationCount).toBe(3);
    expect(response.body.data.summary).toMatchObject({
      activeDays: 1,
      eventCount: 2,
      observationCount: 3,
      duplicateCount: 1,
    });
  });

  it("密度按筛选条件过滤，草稿不计入", async () => {
    const user = await registerUser();
    const site = await createSite(user.id);
    const { speciesId, phenophaseId } = await createSpeciesWithPhase(user.id);

    await record(user, {
      siteId: site.id,
      speciesId,
      phenophaseId,
      kind: "PLANT_PHENOLOGY",
      observationDate: "2025-03-12",
    });
    await record(user, {
      siteId: site.id,
      kind: "WEATHER_ANOMALY",
      observationDate: "2025-03-13",
      anomalyType: "LATE_FROST",
      anomalySeverity: "MODERATE",
    });
    await record(user, {
      siteId: site.id,
      speciesId,
      phenophaseId,
      kind: "PLANT_PHENOLOGY",
      observationDate: "2025-03-14",
      status: "DRAFT",
    });

    const response = await user.agent
      .get(`/api/v1/stats/calendar?year=2025&month=3&siteId=${site.id}&kind=PLANT_PHENOLOGY`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const byDate = new Map<string, { eventCount: number }>(
      response.body.data.cells.map((cell: { date: string; eventCount: number }) => [cell.date, cell]),
    );
    expect(byDate.get("2025-03-12")?.eventCount).toBe(1);
    expect(byDate.get("2025-03-13")?.eventCount).toBe(0);
    expect(byDate.get("2025-03-14")?.eventCount).toBe(0);
  });

  it("闰日边界：2024 年 2 月有 29 个当月格且闰日可承载密度", async () => {
    const user = await registerUser();
    const site = await createSite(user.id);
    await record(user, {
      siteId: site.id,
      kind: "WEATHER_ANOMALY",
      observationDate: "2024-02-29",
      anomalyType: "OTHER",
      anomalySeverity: "MILD",
    });

    const leap = await user.agent
      .get(`/api/v1/stats/calendar?year=2024&month=2&siteId=${site.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(leap.body.data.cells.filter((cell: { inMonth: boolean }) => cell.inMonth)).toHaveLength(29);
    const leapDay = leap.body.data.cells.find((cell: { date: string }) => cell.date === "2024-02-29");
    expect(leapDay.eventCount).toBe(1);

    const common = await user.agent
      .get(`/api/v1/stats/calendar?year=2025&month=2&siteId=${site.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(common.body.data.cells.some((cell: { date: string }) => cell.date === "2025-02-29")).toBe(false);
    expect(common.body.data.cells.filter((cell: { inMonth: boolean }) => cell.inMonth)).toHaveLength(28);
  });

  it("跨月补齐格携带相邻月份密度", async () => {
    const user = await registerUser();
    const site = await createSite(user.id);
    await record(user, {
      siteId: site.id,
      kind: "WEATHER_ANOMALY",
      observationDate: "2025-04-06",
      anomalyType: "OTHER",
      anomalySeverity: "MILD",
    });

    // 2025-04-06 落在 3 月网格的最后一格
    const response = await user.agent
      .get(`/api/v1/stats/calendar?year=2025&month=3&siteId=${site.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const padding = response.body.data.cells[response.body.data.cells.length - 1];
    expect(padding).toMatchObject({ date: "2025-04-06", inMonth: false, eventCount: 1 });
    // 补齐格密度不计入当月汇总
    expect(response.body.data.summary.eventCount).toBe(0);
  });

  it("非法参数与越权访问被拒绝", async () => {
    const user = await registerUser();
    const base = "/api/v1/stats/calendar";
    const authHeader = { Authorization: `Bearer ${user.accessToken}` };

    expect((await user.agent.get(`${base}?year=2025&month=13`).set(authHeader)).status).toBe(400);
    expect((await user.agent.get(`${base}?year=1800&month=1`).set(authHeader)).status).toBe(400);
    expect((await user.agent.get(`${base}?year=2025&month=3&phenophaseId=ph-x`).set(authHeader)).status).toBe(400);
    expect((await user.agent.get(`${base}?year=2025&month=3&siteId=site-other`).set(authHeader)).status).toBe(404);
    expect((await user.agent.get(`${base}?year=2025&month=3`)).status).toBe(401);
  });
});
