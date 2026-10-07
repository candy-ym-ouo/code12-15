/**
 * 观测 -> 日历日的归并、去重与密度分级（纯函数，便于单测）。
 *
 * "同日重复补录只落一条"：
 * 同一日历日 + 同一地点 + 同一观测类型，且物种/物候阶段相同的两条已发布记录，
 * 视为同一条物候事件，只保留最早补录（createdAt 最早）的一条。
 * 与后端 observations 服务的 findDuplicate 判重口径保持一致；
 * 即便用户用 allowDuplicate 或历史数据产生了重复，展示层也再收敛一次。
 */

import type { Observation } from "@/types/models";
import { dayKeyFromInstant, isValidDayKey, type DayKey } from "./calendar";

export interface CalendarObservation extends Observation {
  /** 归并后该记录落入的日历日（Y-M-D，已按用户时区确定）。 */
  dayKey: DayKey;
}

/**
 * 决定一条记录的日历日：
 * - observationDate 是用户在站点当地选定的日历日，是数据模型的主日期，优先使用；
 * - 缺失/非法时退回 observedAt 瞬间，按用户时区取当地日；
 * - 再缺失退回 createdAt 瞬间。
 */
export function resolveDayKey(
  observation: Pick<Observation, "observationDate" | "observedAt" | "createdAt">,
  timeZone: string,
): DayKey {
  if (isValidDayKey(observation.observationDate)) return observation.observationDate;
  const instant = observation.observedAt ?? observation.createdAt;
  return dayKeyFromInstant(instant, timeZone);
}

/** 与后端一致的物候事件签名：同日同地点同类型、同物种同阶段才算重复。 */
export function eventSignature(observation: Observation): string {
  return [
    observation.site.id,
    observation.kind,
    observation.species?.id ?? "",
    observation.phenophase?.id ?? "",
  ].join("|");
}

export interface CalendarIndex {
  /** 每个日历日去重后真正落入的记录。 */
  byDay: Map<DayKey, CalendarObservation[]>;
  /** 每天的去重事件数（密度值）。 */
  counts: Map<DayKey, number>;
  /** 被丢弃的重复补录（可用于提示"已合并 N 条重复"）。 */
  mergedDuplicates: number;
}

function createdAtValue(observation: Observation): number {
  const time = Date.parse(observation.createdAt);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * 把一批观测按日历日归并并去重，构建日历索引。
 * 只统计已发布记录（草稿不参与密度），与统计模块口径一致。
 */
export function buildCalendarIndex(
  observations: Observation[],
  timeZone: string,
): CalendarIndex {
  const byDay = new Map<DayKey, CalendarObservation[]>();
  const seen = new Map<DayKey, Map<string, CalendarObservation>>();
  let mergedDuplicates = 0;

  for (const observation of observations) {
    if (observation.status !== "PUBLISHED") continue;

    const dayKey = resolveDayKey(observation, timeZone);
    const signature = eventSignature(observation);
    const daySeen = seen.get(dayKey);

    if (daySeen?.has(signature)) {
      // 同日重复补录：保留最早补录的那条。
      const existing = daySeen.get(signature)!;
      mergedDuplicates += 1;
      if (createdAtValue(observation) < createdAtValue(existing)) {
        const replacement: CalendarObservation = { ...observation, dayKey };
        daySeen.set(signature, replacement);
        const list = byDay.get(dayKey) ?? [];
        const index = list.indexOf(existing);
        if (index >= 0) list[index] = replacement;
      }
      continue;
    }

    const entry: CalendarObservation = { ...observation, dayKey };
    if (!daySeen) seen.set(dayKey, new Map([[signature, entry]]));
    else daySeen.set(signature, entry);

    const list = byDay.get(dayKey) ?? [];
    list.push(entry);
    byDay.set(dayKey, list);
  }

  const counts = new Map<DayKey, number>();
  for (const [dayKey, list] of byDay) counts.set(dayKey, list.length);

  return { byDay, counts, mergedDuplicates };
}

/** 某一天去重后的事件数。 */
export function countOnDay(index: CalendarIndex, dayKey: DayKey): number {
  return index.counts.get(dayKey) ?? 0;
}

/**
 * 把当天事件数映射为 0-4 的密度档（0 无，1-4 递增）。
 * 以当前月内最大事件数为基准线性分档，避免数据稀疏时整月都只有一档。
 */
export function densityLevel(count: number, monthMax: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (monthMax <= 1) return 1;
  const level = Math.ceil((count / monthMax) * 4);
  return Math.min(4, Math.max(1, level)) as 1 | 2 | 3 | 4;
}

/** 当前月份（不含补位）的最大事件数。 */
export function maxCountInMonth(
  index: CalendarIndex,
  year: number,
  month: number,
): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  let max = 0;
  for (const [dayKey, count] of index.counts) {
    if (dayKey.startsWith(prefix) && count > max) max = count;
  }
  return max;
}

/** 取某天的记录并按日期内时间排序（observedAt 优先，其次 createdAt）。 */
export function observationsOnDay(
  index: CalendarIndex,
  dayKey: DayKey,
): CalendarObservation[] {
  const list = index.byDay.get(dayKey) ?? [];
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.observedAt ?? a.createdAt);
    const tb = Date.parse(b.observedAt ?? b.createdAt);
    return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
  });
}
