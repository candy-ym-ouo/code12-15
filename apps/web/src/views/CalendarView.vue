<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import CalendarGrid from "@/components/CalendarGrid.vue";
import EmptyState from "@/components/EmptyState.vue";
import { useCalendarStore } from "@/stores/calendar";
import { useAuthStore } from "@/stores/auth";
import { useSiteStore } from "@/stores/site";
import { useSpeciesStore } from "@/stores/species";
import {
  formatYearMonth,
  parseDayKey,
  timezoneOffsetLabel,
  type DayKey,
} from "@/lib/calendar";
import { CATEGORY_LABELS, KIND_LABELS, type ObservationKind } from "@/types/models";

const calendar = useCalendarStore();
const auth = useAuthStore();
const siteStore = useSiteStore();
const speciesStore = useSpeciesStore();
const router = useRouter();

const TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Urumqi",
  "Asia/Tokyo",
  "Asia/Bangkok",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

const kindOptions = Object.entries(KIND_LABELS) as Array<[ObservationKind, string]>;

const timezoneChoices = computed(() => {
  const names = new Set([auth.user?.timezone, calendar.timeZone, ...TIMEZONES].filter(Boolean) as string[]);
  return [...names].map((name) => ({ name, offset: safeOffset(name) }));
});

function safeOffset(name: string): string {
  try {
    return timezoneOffsetLabel(name);
  } catch {
    return "";
  }
}

const phenophaseOptions = computed(
  () => speciesStore.mine.find((item) => item.id === calendar.filters.speciesId)?.phenophases ?? [],
);

function onSpeciesChange() {
  // 切换物种后阶段筛选不再适用。
  calendar.filters.phenophaseId = "";
}

const title = computed(() => formatYearMonth(calendar.yearMonth.year, calendar.yearMonth.month));
const isCurrentMonth = computed(() => {
  const today = parseDayKey(calendar.todayKey);
  return today.year === calendar.yearMonth.year && today.month === calendar.yearMonth.month;
});

const selectedTitle = computed(() => {
  if (!calendar.selectedDayKey) return "";
  const { year, month, day } = parseDayKey(calendar.selectedDayKey);
  const suffix = calendar.selectedDayKey === calendar.todayKey ? "（今天）" : "";
  return `${year} 年 ${month} 月 ${day} 日${suffix}`;
});

const densityLegend = [
  { level: 0, label: "无" },
  { level: 1, label: "少" },
  { level: 2, label: "中" },
  { level: 3, label: "多" },
  { level: 4, label: "高峰" },
];

function onSelect(dayKey: DayKey) {
  calendar.selectDay(dayKey === calendar.selectedDayKey ? null : dayKey);
}

function recordLabel(record: { kind: ObservationKind; title: string | null; species: { commonName: string } | null }) {
  return record.title || record.species?.commonName || KIND_LABELS[record.kind];
}

const selectedInMonth = computed(
  () => calendar.selectedDayKey !== null && inMonth(calendar.selectedDayKey),
);

function inMonth(dayKey: DayKey): boolean {
  const { year, month } = parseDayKey(dayKey);
  return year === calendar.yearMonth.year && month === calendar.yearMonth.month;
}

const timezoneHint = computed(() =>
  calendar.timeZone === "UTC" ? "当前按 UTC 判定“今天”与瞬间归日" : `记录按日历日归并；“今天”按 ${calendar.timeZone} 判定`,
);

watch(
  () => [calendar.filters.siteId, calendar.filters.speciesId, calendar.filters.phenophaseId, calendar.filters.kind],
  () => {
    void calendar.reload();
  },
);

onMounted(async () => {
  // 用账户时区覆盖浏览器本地时区（设置页可改），保证"按用户时区"，并定位到该时区当前月。
  if (auth.user?.timezone) calendar.applyTimeZoneSilently(auth.user.timezone);
  await Promise.all([siteStore.fetch(), speciesStore.fetch()]);
  await calendar.reload();
});
</script>

<template>
  <div class="page page--wide">
    <header class="page-header">
      <h1 class="page-title">物候日历</h1>
      <p class="page-subtitle">按你的时区在月历网格上查看每日物候记录密度，同日重复补录只计一条。</p>
    </header>

    <section class="toolbar card">
      <div class="toolbar__nav">
        <el-button :icon="ArrowLeft" aria-label="上一月" @click="calendar.goPrevMonth()" />
        <strong class="toolbar__title">{{ title }}</strong>
        <el-button :icon="ArrowRight" aria-label="下一月" @click="calendar.goNextMonth()" />
        <el-button size="small" :disabled="isCurrentMonth" @click="calendar.goToday()">回到今天</el-button>
      </div>

      <div class="toolbar__filters">
        <el-select
          :model-value="calendar.timeZone"
          placeholder="时区"
          class="toolbar__control toolbar__control--tz"
          @update:model-value="(value: string) => calendar.setTimeZone(value)"
        >
          <el-option
            v-for="choice in timezoneChoices"
            :key="choice.name"
            :label="choice.offset ? `${choice.name}（${choice.offset}）` : choice.name"
            :value="choice.name"
          />
        </el-select>
        <el-select
          v-model="calendar.filters.siteId"
          placeholder="全部地点"
          clearable
          class="toolbar__control"
        >
          <el-option v-for="site in siteStore.sites" :key="site.id" :label="site.name" :value="site.id" />
        </el-select>
        <el-select
          v-model="calendar.filters.speciesId"
          placeholder="全部物种"
          filterable
          clearable
          class="toolbar__control"
          @change="onSpeciesChange"
        >
          <el-option v-for="species in speciesStore.mine" :key="species.id" :label="species.commonName" :value="species.id" />
        </el-select>
        <el-select
          v-model="calendar.filters.phenophaseId"
          placeholder="全部阶段"
          clearable
          class="toolbar__control"
          :disabled="!calendar.filters.speciesId"
        >
          <el-option v-for="phase in phenophaseOptions" :key="phase.id" :label="phase.name" :value="phase.id" />
        </el-select>
        <el-select
          v-model="calendar.filters.kind"
          placeholder="全部类型"
          clearable
          class="toolbar__control"
        >
          <el-option v-for="[value, label] in kindOptions" :key="value" :label="label" :value="value" />
        </el-select>
      </div>
    </section>

    <p class="hint muted">
      {{ timezoneHint }} · 本月去重后共 {{ calendar.monthTotal }} 条物候事件
      <template v-if="calendar.index.mergedDuplicates > 0">· 已合并 {{ calendar.index.mergedDuplicates }} 条同日重复补录</template>
    </p>

    <div class="layout">
      <section class="calendar-card card" v-loading="calendar.loading">
        <CalendarGrid
          :weeks="calendar.matrix.weeks"
          :count-for-day="calendar.countForDay"
          :level-for-day="calendar.levelForDay"
          :today-key="calendar.todayKey"
          :selected-day-key="calendar.selectedDayKey"
          @select="onSelect"
        />

        <div class="legend" aria-label="密度图例">
          <span
            v-for="item in densityLegend"
            :key="item.level"
            class="legend__item"
          >
            <span class="legend__swatch" :class="`cell--level-${item.level}`" />
            {{ item.label }}
          </span>
          <span class="legend__note muted">色阶按本月峰值归一；闰日有「闰」标记</span>
        </div>

        <EmptyState
          v-if="calendar.error"
          title="日历加载失败"
          :description="calendar.error"
          action-text="重试"
          @action="calendar.reload()"
        />
        <EmptyState
          v-else-if="calendar.loaded && calendar.monthTotal === 0"
          title="本月没有符合条件的物候记录"
          description="试试切换地点、物种类型，或到时间线补录一条。"
        />
      </section>

      <aside class="detail card">
        <template v-if="calendar.selectedDayKey && selectedInMonth">
          <header class="detail__header">
            <h2 class="detail__title">{{ selectedTitle }}</h2>
            <span class="detail__count muted">{{ calendar.selectedRecords.length }} 条</span>
          </header>

          <ul v-if="calendar.selectedRecords.length" class="detail__list">
            <li v-for="record in calendar.selectedRecords" :key="record.id">
              <button type="button" class="detail__entry" @click="router.push(`/observations/${record.id}`)">
                <span
                  class="detail__dot"
                  :style="{ background: record.phenophase?.color || 'var(--color-primary)' }"
                />
                <span class="detail__body">
                  <span class="detail__name">{{ recordLabel(record) }}</span>
                  <span class="detail__meta muted">
                    {{ KIND_LABELS[record.kind] }}
                    <template v-if="record.species"> · {{ CATEGORY_LABELS[record.species.category] }}</template>
                    <template v-if="record.phenophase"> · {{ record.phenophase.name }}</template>
                    · {{ record.site.name }}
                  </span>
                </span>
                <span v-if="record.photos.length" class="detail__photos muted">📷 {{ record.photos.length }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="muted">这一天没有记录。</p>
        </template>

        <EmptyState
          v-else
          title="点击日历上的日期"
          description="查看该天去重后的物候事件，点击条目可进入详情。"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
}

.toolbar__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar__title {
  font-size: 17px;
  min-width: 128px;
  text-align: center;
}

.toolbar__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar__control {
  width: 150px;
}

.toolbar__control--tz {
  width: 230px;
}

.hint {
  margin: 10px 2px;
  font-size: 13px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  align-items: start;
}

.calendar-card {
  padding: 14px;
}

.calendar-card :deep(.empty) {
  margin-top: 14px;
  background: transparent;
  border: none;
  padding: 32px 20px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend__swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  display: inline-block;
}

.legend__note {
  margin-left: auto;
}

.detail {
  padding: 14px;
  position: sticky;
  top: 70px;
}

.detail__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.detail__title {
  margin: 0;
  font-size: 16px;
}

.detail__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail__entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
}

.detail__entry:hover {
  border-color: var(--color-primary-light-5);
  background: var(--color-primary-soft);
}

.detail__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}

.detail__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.detail__name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail__meta {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail__photos {
  margin-left: auto;
  font-size: 12px;
  flex: none;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .detail {
    position: static;
  }

  .legend__note {
    margin-left: 0;
    flex-basis: 100%;
  }
}

@media (max-width: 767px) {
  .toolbar__control,
  .toolbar__control--tz {
    width: 100%;
  }

  .toolbar__filters {
    width: 100%;
  }

  .toolbar__title {
    min-width: 104px;
    font-size: 15px;
  }
}
</style>
