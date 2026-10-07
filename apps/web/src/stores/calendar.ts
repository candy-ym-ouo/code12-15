import { defineStore } from "pinia";
import { observationApi, type ObservationQuery } from "@/api";
import type { Observation, ObservationKind } from "@/types/models";
import {
  addMonths,
  buildMonthMatrix,
  dayKeyInTimezone,
  matrixWindow,
  parseDayKey,
  type DayKey,
  type YearMonth,
} from "@/lib/calendar";
import {
  buildCalendarIndex,
  countOnDay,
  densityLevel,
  maxCountInMonth,
  observationsOnDay,
  type CalendarIndex,
  type CalendarObservation,
} from "@/lib/calendarIndex";

const PAGE_LIMIT = 50;

interface CalendarFilters {
  siteId: string;
  speciesId: string;
  phenophaseId: string;
  kind: "" | ObservationKind;
}

const defaultFilters = (): CalendarFilters => ({
  siteId: "",
  speciesId: "",
  phenophaseId: "",
  kind: "",
});

function initialYearMonth(timeZone: string): YearMonth {
  const today = dayKeyInTimezone(timeZone);
  const { year, month } = parseDayKey(today);
  return { year, month };
}

export const useCalendarStore = defineStore("calendar", {
  state: () => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
    return {
      timeZone,
      yearMonth: initialYearMonth(timeZone),
      filters: defaultFilters(),
      observations: [] as Observation[],
      index: { byDay: new Map(), counts: new Map(), mergedDuplicates: 0 } as CalendarIndex,
      loading: false,
      loaded: false,
      error: "" as string,
      selectedDayKey: null as DayKey | null,
    };
  },
  getters: {
    matrix(state) {
      return buildMonthMatrix(state.yearMonth.year, state.yearMonth.month, 1);
    },
    todayKey(state): DayKey {
      return dayKeyInTimezone(state.timeZone);
    },
    monthMax(state): number {
      return maxCountInMonth(state.index, state.yearMonth.year, state.yearMonth.month);
    },
    selectedRecords(state): CalendarObservation[] {
      if (!state.selectedDayKey) return [];
      return observationsOnDay(state.index, state.selectedDayKey);
    },
    monthTotal(state): number {
      const prefix = `${state.yearMonth.year}-${String(state.yearMonth.month).padStart(2, "0")}-`;
      let total = 0;
      for (const [dayKey, count] of state.index.counts) {
        if (dayKey.startsWith(prefix)) total += count;
      }
      return total;
    },
    countForDay(state): (dayKey: DayKey) => number {
      return (dayKey: DayKey) => countOnDay(state.index, dayKey);
    },
    levelForDay(): (dayKey: DayKey) => number {
      return (dayKey: DayKey) => densityLevel(countOnDay(this.index, dayKey), this.monthMax);
    },
  },
  actions: {
    setTimeZone(timeZone: string, resetToToday = false) {
      if (this.timeZone === timeZone && !resetToToday) return;
      this.timeZone = timeZone;
      this.selectedDayKey = null;
      if (resetToToday) {
        const { year, month } = parseDayKey(dayKeyInTimezone(timeZone));
        this.yearMonth = { year, month };
      }
      void this.reload();
    },
    /** 仅切换时区与当前月，不触发请求（供初始化时同步账户时区）。 */
    applyTimeZoneSilently(timeZone: string) {
      this.timeZone = timeZone;
      this.selectedDayKey = null;
      const { year, month } = parseDayKey(dayKeyInTimezone(timeZone));
      this.yearMonth = { year, month };
    },
    goPrevMonth() {
      this.yearMonth = addMonths(this.yearMonth, -1);
      this.selectedDayKey = null;
      void this.loadMonth();
    },
    goNextMonth() {
      this.yearMonth = addMonths(this.yearMonth, 1);
      this.selectedDayKey = null;
      void this.loadMonth();
    },
    goToday() {
      const { year, month } = parseDayKey(dayKeyInTimezone(this.timeZone));
      this.yearMonth = { year, month };
      this.selectedDayKey = null;
      void this.loadMonth();
    },
    selectDay(dayKey: DayKey | null) {
      this.selectedDayKey = dayKey;
    },
    buildQuery(from: DayKey, to: DayKey, cursor: string | null): ObservationQuery {
      return {
        from,
        to,
        status: "PUBLISHED",
        sort: "date_asc",
        limit: PAGE_LIMIT,
        cursor,
        siteId: this.filters.siteId || undefined,
        speciesId: this.filters.speciesId || undefined,
        phenophaseId: this.filters.phenophaseId || undefined,
        kind: this.filters.kind || undefined,
      };
    },
    /** 拉取整个网格窗口（含上月末/下月初补位）的已发布观测，自动翻页。 */
    async loadMonth() {
      const { from, to } = matrixWindow(buildMonthMatrix(this.yearMonth.year, this.yearMonth.month, 1));
      this.loading = true;
      this.error = "";
      try {
        let cursor: string | null = null;
        const collected: Observation[] = [];
        do {
          const { items, meta } = await observationApi.list(this.buildQuery(from, to, cursor));
          collected.push(...items);
          cursor = meta.nextCursor;
        } while (cursor);
        this.observations = collected;
        this.index = buildCalendarIndex(collected, this.timeZone);
        this.loaded = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "加载日历失败";
      } finally {
        this.loading = false;
      }
    },
    async reload() {
      await this.loadMonth();
    },
  },
});
