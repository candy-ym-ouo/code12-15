<script setup lang="ts">
import type { CalendarCell, DayKey } from "@/lib/calendar";

/**
 * 月历网格纯展示组件：
 * - 周一起列，表头 一…日；
 * - 密度 0-4 对应背景色档；
 * - 跨月补位格置灰不可点；闰日加"闰"标记；今天加描边。
 */
const props = defineProps<{
  weeks: CalendarCell[][];
  countForDay: (dayKey: DayKey) => number;
  levelForDay: (dayKey: DayKey) => number;
  todayKey: DayKey;
  selectedDayKey: DayKey | null;
}>();

const emit = defineEmits<{
  select: [dayKey: DayKey];
}>();

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

function cellClass(cell: CalendarCell): Record<string, boolean> {
  return {
    [`cell--level-${props.levelForDay(cell.dayKey)}`]: true,
    "cell--muted": !cell.inMonth,
    "cell--today": cell.dayKey === props.todayKey,
    "cell--selected": cell.dayKey === props.selectedDayKey,
    "cell--leap": cell.isLeapDay,
  };
}

function select(cell: CalendarCell) {
  if (!cell.inMonth) return;
  emit("select", cell.dayKey);
}
</script>

<template>
  <div class="calendar-grid" role="grid" aria-label="物候月历">
    <div class="calendar-grid__head" role="row">
      <div v-for="label in weekdayLabels" :key="label" class="calendar-grid__weekday" role="columnheader">
        {{ label }}
      </div>
    </div>

    <div v-for="(week, rowIndex) in weeks" :key="rowIndex" class="calendar-grid__row" role="row">
      <button
        v-for="cell in week"
        :key="cell.dayKey"
        type="button"
        role="gridcell"
        class="cell"
        :class="cellClass(cell)"
        :disabled="!cell.inMonth"
        :aria-label="`${cell.dayKey}，${props.countForDay(cell.dayKey)} 条物候记录`"
        :aria-current="cell.dayKey === props.todayKey ? 'date' : undefined"
        :aria-pressed="cell.dayKey === props.selectedDayKey"
        @click="select(cell)"
      >
        <span class="cell__day">{{ cell.day }}</span>
        <span v-if="cell.isLeapDay && cell.inMonth" class="cell__leap" title="闰日">闰</span>
        <span v-if="cell.inMonth && props.countForDay(cell.dayKey) > 0" class="cell__count">
          {{ props.countForDay(cell.dayKey) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.calendar-grid__head,
.calendar-grid__row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-grid__weekday {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 4px 0;
}

.cell {
  position: relative;
  aspect-ratio: 1 / 1;
  min-height: 52px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 6px 8px;
  cursor: pointer;
  transition: transform 0.05s ease, box-shadow 0.15s ease;
}

.cell:hover:not(:disabled) {
  box-shadow: 0 0 0 2px var(--color-primary-light-7);
}

.cell:active:not(:disabled) {
  transform: scale(0.97);
}

.cell:disabled {
  cursor: default;
}

.cell__day {
  font-size: 14px;
  line-height: 1.2;
}

.cell__count {
  position: absolute;
  right: 6px;
  bottom: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
}

.cell__leap {
  position: absolute;
  left: 50%;
  top: 3px;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--color-accent);
}

/* 密度 0-4：由浅入深的植物绿色 */
.cell--level-0 {
  background: var(--color-surface);
}

.cell--level-1 {
  background: #eef4ef;
}

.cell--level-2 {
  background: #cfe0d3;
}

.cell--level-3 {
  background: #8fb39a;
}

.cell--level-4 {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.cell--level-4 .cell__day,
.cell--level-4 .cell__count {
  color: #fff;
}

.cell--muted {
  background: transparent;
  border-color: transparent;
  color: #b7beb9;
}

.cell--muted .cell__count {
  display: none;
}

.cell--today {
  box-shadow: inset 0 0 0 2px var(--color-accent);
}

.cell--selected {
  box-shadow: 0 0 0 2px var(--color-primary);
  border-color: var(--color-primary);
}

@media (max-width: 767px) {
  .cell {
    min-height: 44px;
    padding: 4px 6px;
  }

  .cell__day {
    font-size: 13px;
  }

  .cell__count {
    font-size: 12px;
    right: 4px;
    bottom: 2px;
  }
}
</style>
