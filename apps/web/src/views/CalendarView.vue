<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import dayjs from "dayjs";
import { ElMessage } from "element-plus";
import { ArrowLeft, ArrowRight, Plus } from "@element-plus/icons-vue";
import CalendarGrid from "@/components/CalendarGrid.vue";
import EmptyState from "@/components/EmptyState.vue";
import { observationApi, statsApi } from "@/api";
import { apiErrorMessage } from "@/api/client";
import { useSiteStore } from "@/stores/site";
import { useSpeciesStore } from "@/stores/species";
import { CATEGORY_LABELS, KIND_LABELS, type CalendarCell, type CalendarResult, type Observation, type ObservationKind } from "@/types/models";
import { formatMonthTitle, nextMonth, previousMonth } from "@/utils/calendar";

const router = useRouter();
const siteStore = useSiteStore();
const speciesStore = useSpeciesStore();

// 初始月份按"用户时区的今天"取，服务端会再次按用户配置时区判定今天。
const initial = dayjs();
const year = ref(initial.year());
const month = ref(initial.month() + 1);

const siteId = ref("");
const speciesId = ref("");
const phenophaseId = ref("");
const kind = ref<"" | ObservationKind>("");

const calendar = ref<CalendarResult | null>(null);
const loading = ref(false);
const selectedDate = ref<string | null>(null);
const dayItems = ref<Observation[]>([]);
const dayLoading = ref(false);

const phenophaseOptions = computed(
  () => speciesStore.mine.find((item) => item.id === speciesId.value)?.phenophases ?? [],
);

const monthTitle = computed(() => formatMonthTitle(year.value, month.value));

const cellsByDate = computed(() => {
  const map = new Map<string, CalendarCell>();
  for (const cell of calendar.value?.cells ?? []) map.set(cell.date, cell);
  return map;
});

const selectedCell = computed(() =>
  selectedDate.value ? cellsByDate.value.get(selectedDate.value) ?? null : null,
);

async function loadCalendar() {
  loading.value = true;
  try {
    calendar.value = await statsApi.calendar({
      year: year.value,
      month: month.value,
      siteId: siteId.value || undefined,
      speciesId: speciesId.value || undefined,
      phenophaseId: phenophaseId.value || undefined,
      kind: kind.value || undefined,
    });
    // 选中日不在新网格（如翻月）时清空侧栏
    if (selectedDate.value && !cellsByDate.value.has(selectedDate.value)) {
      selectedDate.value = null;
      dayItems.value = [];
    }
  } catch (error) {
    ElMessage.error(apiErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function openDay(cell: CalendarCell) {
  selectedDate.value = cell.date;
  dayItems.value = [];
  dayLoading.value = true;
  try {
    const { items } = await observationApi.list({
      siteId: siteId.value || undefined,
      speciesId: speciesId.value || undefined,
      phenophaseId: phenophaseId.value || undefined,
      kind: kind.value || undefined,
      from: cell.date,
      to: cell.date,
      sort: "date_asc",
      limit: 50,
    });
    dayItems.value = items;
  } catch (error) {
    ElMessage.error(apiErrorMessage(error));
  } finally {
    dayLoading.value = false;
  }
}

function goPrevMonth() {
  const prev = previousMonth(year.value, month.value);
  year.value = prev.year;
  month.value = prev.month;
}

function goNextMonth() {
  const next = nextMonth(year.value, month.value);
  year.value = next.year;
  month.value = next.month;
}

function backToToday() {
  const now = dayjs();
  year.value = now.year();
  month.value = now.month() + 1;
}

function recordFor(date: string) {
  void router.push({
    name: "observation-new",
    query: {
      date,
      ...(siteId.value ? { siteId: siteId.value } : {}),
      ...(speciesId.value ? { speciesId: speciesId.value } : {}),
      ...(kind.value ? { kind: kind.value } : {}),
    },
  });
}

function kindLabel(value: Observation["kind"]): string {
  return KIND_LABELS[value] ?? value;
}

watch([year, month], () => {
  void loadCalendar();
});

watch([siteId, speciesId, phenophaseId, kind], () => {
  selectedDate.value = null;
  dayItems.value = [];
  void loadCalendar();
});

onMounted(async () => {
  await Promise.all([siteStore.fetch(), speciesStore.fetch()]);
  if (siteStore.sites.length === 1) siteId.value = siteStore.sites[0].id;
  await loadCalendar();
});
</script>

<template>
  <div class="page calendar-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">物候日历</h1>
        <p class="page-subtitle">按你的时区在月历上回看每日记录密度，点击日期查看当天明细</p>
      </div>
    </header>

    <section class="filters card" aria-label="日历筛选">
      <el-select v-model="siteId" placeholder="全部地点" clearable class="filters__control">
        <el-option v-for="site in siteStore.sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <el-select v-model="kind" placeholder="全部类型" clearable class="filters__control filters__control--small">
        <el-option v-for="(label, value) in KIND_LABELS" :key="value" :label="label" :value="value" />
      </el-select>
      <el-select v-model="speciesId" placeholder="全部物种" clearable filterable class="filters__control">
        <el-option
          v-for="species in speciesStore.mine"
          :key="species.id"
          :label="`${species.commonName}（${CATEGORY_LABELS[species.category]}）`"
          :value="species.id"
        />
      </el-select>
      <el-select
        v-model="phenophaseId"
        placeholder="全部阶段"
        clearable
        class="filters__control filters__control--small"
        :disabled="!speciesId"
      >
        <el-option v-for="phase in phenophaseOptions" :key="phase.id" :label="phase.name" :value="phase.id" />
      </el-select>
    </section>

    <section class="calendar-card card">
      <div class="calendar-toolbar">
        <div class="calendar-toolbar__nav">
          <el-button :icon="ArrowLeft" aria-label="上一个月" @click="goPrevMonth" />
          <h2 class="calendar-toolbar__title">{{ monthTitle }}</h2>
          <el-button :icon="ArrowRight" aria-label="下一个月" @click="goNextMonth" />
        </div>
        <div class="calendar-toolbar__meta">
          <span v-if="calendar" class="muted">
            时区 {{ calendar.timezone }} · 今天 {{ calendar.today }}
          </span>
          <el-button text size="small" @click="backToToday">回到今天</el-button>
        </div>
      </div>

      <CalendarGrid
        v-if="calendar"
        :cells="calendar.cells"
        :selected-date="selectedDate"
        :loading="loading"
        @select="openDay"
      />

      <footer class="calendar-legend">
        <div class="calendar-legend__scale" aria-hidden="true">
          <span class="calendar-legend__label muted">少</span>
          <span class="calendar-legend__box calendar-legend__box--0"></span>
          <span class="calendar-legend__box calendar-legend__box--1"></span>
          <span class="calendar-legend__box calendar-legend__box--2"></span>
          <span class="calendar-legend__box calendar-legend__box--3"></span>
          <span class="calendar-legend__box calendar-legend__box--4"></span>
          <span class="calendar-legend__label muted">多</span>
        </div>
        <p v-if="calendar" class="calendar-legend__summary muted">
          当月有记录 {{ calendar.summary.activeDays }} 天 · {{ calendar.summary.eventCount }} 个物候事件
          <template v-if="calendar.summary.duplicateCount > 0">
            · {{ calendar.summary.observationCount }} 条记录（{{ calendar.summary.duplicateCount }} 条同日重复补录已折叠）
          </template>
        </p>
      </footer>
    </section>

    <aside v-if="selectedDate" class="day-panel card" aria-live="polite">
      <header class="day-panel__header">
        <h3 class="day-panel__title">{{ selectedDate }} 的记录</h3>
        <el-button
          v-if="selectedCell"
          size="small"
          type="primary"
          plain
          :icon="Plus"
          @click="recordFor(selectedCell.date)"
        >
          补录当天
        </el-button>
      </header>

      <p v-if="selectedCell && selectedCell.observationCount > selectedCell.eventCount" class="day-panel__hint">
        当天 {{ selectedCell.observationCount }} 条记录按同一地点 / 物种 / 阶段 / 类型去重后为
        {{ selectedCell.eventCount }} 个物候事件。
      </p>

      <el-skeleton v-if="dayLoading" :rows="3" animated />

      <ul v-else-if="dayItems.length" class="day-list">
        <li v-for="item in dayItems" :key="item.id">
          <button type="button" class="day-list__item" @click="router.push({ name: 'observation-detail', params: { id: item.id } })">
            <span class="day-list__kind">{{ kindLabel(item.kind) }}</span>
            <span class="day-list__title">{{ item.title ?? item.species?.commonName ?? item.site.name }}</span>
            <span class="day-list__phase muted">{{ item.phenophase?.name ?? "" }}</span>
          </button>
        </li>
      </ul>

      <EmptyState
        v-else
        title="当天没有匹配的记录"
        description="可以补录一条，或调整上方的地点、类型与物种筛选。"
        action-text="补录当天"
        @action="recordFor(selectedDate)"
      />
    </aside>
  </div>
</template>

<style scoped>
.calendar-page {
  max-width: 1040px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.filters__control {
  width: 190px;
}

.filters__control--small {
  width: 140px;
}

.calendar-card {
  padding: 14px;
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.calendar-toolbar__nav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.calendar-toolbar__title {
  margin: 0;
  font-size: 17px;
  min-width: 132px;
  text-align: center;
}

.calendar-toolbar__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.calendar-legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 12px;
}

.calendar-legend__scale {
  display: flex;
  align-items: center;
  gap: 4px;
}

.calendar-legend__box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

.calendar-legend__box--0 { background: transparent; }
.calendar-legend__box--1 { background: var(--color-primary-light-9, #eaf1ec); }
.calendar-legend__box--2 { background: var(--color-primary-light-7, #bccfc0); }
.calendar-legend__box--3 { background: var(--color-primary-light-5, #93b09b); }
.calendar-legend__box--4 { background: var(--color-primary, #3f6f52); }

.calendar-legend__summary {
  margin: 0;
}

.day-panel {
  margin-top: 14px;
  padding: 14px 16px;
}

.day-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.day-panel__title {
  margin: 0;
  font-size: 15px;
}

.day-panel__hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--color-accent);
}

.day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.day-list__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.day-list__item:hover {
  background: var(--color-primary-soft);
}

.day-list__kind {
  flex: none;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 4px;
  padding: 1px 8px;
}

.day-list__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-list__phase {
  flex: none;
  font-size: 12px;
}

@media (max-width: 767px) {
  .filters__control,
  .filters__control--small {
    width: 100%;
  }

  .calendar-toolbar__meta {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
