import { getOwnedPhenophase, getOwnedSite, getOwnedSpecies } from "../../lib/access";
import { aggregateDailyDensity, buildMonthGrid, gridRangeOfMonth, type CalendarCell } from "../../lib/calendar";
import { todayInTimezone } from "../../lib/date";
import { prisma } from "../../lib/prisma";
import type { CalendarQuery } from "./schema";

export async function calendar(userId: string, query: CalendarQuery) {
  // 过滤到具体地点/物种时先校验归属，避免把别人的数据通过日历暴露出去。
  if (query.siteId) await getOwnedSite(userId, query.siteId);
  if (query.speciesId) await getOwnedSpecies(userId, query.speciesId);
  if (query.phenophaseId) await getOwnedPhenophase(userId, query.phenophaseId);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const timezone = user?.timezone ?? "Asia/Shanghai";

  // 以用户所在时区的当地日历日作为"今天"。observationDate 本身就是站点当地日历日，
  // 因此"今天高亮"按时区判定，而所有密度统计只按日历日字符串分组。
  const today = todayInTimezone(timezone);
  const { from, to } = gridRangeOfMonth(query.year, query.month);

  const rows = await prisma.observation.findMany({
    where: {
      ownerId: userId,
      status: "PUBLISHED",
      observationDate: { gte: from, lte: to },
      ...(query.siteId ? { siteId: query.siteId } : {}),
      ...(query.speciesId ? { speciesId: query.speciesId } : {}),
      ...(query.phenophaseId ? { phenophaseId: query.phenophaseId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
    },
    select: {
      observationDate: true,
      siteId: true,
      speciesId: true,
      phenophaseId: true,
      kind: true,
    },
  });

  const density = aggregateDailyDensity(rows);
  const cells: CalendarCell[] = buildMonthGrid(query.year, query.month, { density, today });

  const inMonthCells = cells.filter((cell) => cell.inMonth);
  const totalEvents = inMonthCells.reduce((sum, cell) => sum + cell.eventCount, 0);
  const totalObservations = inMonthCells.reduce((sum, cell) => sum + cell.observationCount, 0);
  const activeDays = inMonthCells.filter((cell) => cell.eventCount > 0).length;

  return {
    year: query.year,
    month: query.month,
    timezone,
    today,
    grid: { from, to },
    // 网格补齐范围会跨到相邻月份，cells 按周一开头的 6×7 顺序返回。
    cells,
    summary: {
      activeDays,
      eventCount: totalEvents,
      observationCount: totalObservations,
      // 同日重复补录被折叠掉的条数（>0 说明存在重复记录）。
      duplicateCount: totalObservations - totalEvents,
    },
  };
}
