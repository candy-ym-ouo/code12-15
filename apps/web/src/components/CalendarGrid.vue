<script setup lang="ts">
import { computed } from "vue";
import type { CalendarCell } from "@/types/models";

const props = defineProps<{
  cells: CalendarCell[];
  selectedDate: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{ select: [cell: CalendarCell] }>();

const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];

/** 相对密度分级：当月最大值决定上限，避免稀疏月份全是浅色。 */
const maxEvents = computed(() => Math.max(1, ...props.cells.filter((cell) => cell.inMonth).map((cell) => cell.eventCount)));

function level(cell: CalendarCell): number {
  if (cell.eventCount <= 0) return 0;
  const ratio = cell.eventCount / maxEvents.value;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function title(cell: CalendarCell): string {
  if (cell.eventCount === 0) return `${cell.date}：无记录`;
  const base = `${cell.date}：${cell.eventCount} 个物候事件`;
  return cell.observationCount > cell.eventCount
    ? `${base}（${cell.observationCount} 条记录，含 ${cell.observationCount - cell.eventCount} 条同日重复补录）`
    : base;
}

function keydown(cell: CalendarCell, event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("select", cell);
  }
}
</script>

<template>
  <div class="calendar-grid" :class="{ 'is-loading': loading }" role="grid" aria-label="物候日历月网格">
    <div class="calendar-grid__weekdays" aria-hidden="true">
      <span v-for="weekday in WEEKDAY_HEADERS" :key="weekday" class="calendar-grid__weekday">{{ weekday }}</span>
    </div>

    <div class="calendar-grid__body">
      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        role="gridcell"
        class="calendar-cell"
        :class="[
          `calendar-cell--level-${level(cell)}`,
          {
            'is-outside': !cell.inMonth,
            'is-weekend': cell.isWeekend && cell.inMonth,
            'is-today': cell.isToday,
            'is-selected': selectedDate === cell.date,
            'has-events': cell.eventCount > 0,
          },
        ]"
        :aria-label="title(cell)"
        :aria-current="cell.isToday ? 'date' : undefined"
        :title="title(cell)"
        @click="emit('select', cell)"
        @keydown="keydown(cell, $event)"
      >
        <span class="calendar-cell__day">{{ cell.day }}</span>
        <span v-if="cell.eventCount > 0" class="calendar-cell__count">{{ cell.eventCount }}</span>
        <span v-if="cell.observationCount > cell.eventCount" class="calendar-cell__repeat" aria-hidden="true">·</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  opacity: 1;
  transition: opacity 0.15s ease;
}

.calendar-grid.is-loading {
  opacity: 0.55;
}

.calendar-grid__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 6px;
}

.calendar-grid__weekday {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 4px 0;
}

.calendar-grid__body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  aspect-ratio: 1 / 1;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  padding: 0;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.calendar-cell:hover {
  border-color: var(--color-primary-light-5, #93b09b);
}

.calendar-cell:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.calendar-cell.is-outside {
  color: var(--color-text-muted);
  opacity: 0.45;
}

.calendar-cell.is-weekend:not(.has-events) {
  background: rgba(35, 40, 42, 0.025);
}

/* 密度色阶：越绿表示当天物候事件越多 */
.calendar-cell--level-1 { background: var(--color-primary-light-9, #eaf1ec); }
.calendar-cell--level-2 { background: var(--color-primary-light-7, #bccfc0); }
.calendar-cell--level-3 { background: var(--color-primary-light-5, #93b09b); }
.calendar-cell--level-4 { background: var(--color-primary, #3f6f52); color: #fff; }

.calendar-cell__day {
  font-size: 13px;
  line-height: 1.2;
}

.calendar-cell__count {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.calendar-cell__repeat {
  position: absolute;
  top: 2px;
  right: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-accent);
  line-height: 1;
}

.calendar-cell--level-4 .calendar-cell__repeat {
  color: #ffe0b8;
}

.calendar-cell.is-today .calendar-cell__day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-accent);
  color: #fff;
  font-weight: 700;
}

.calendar-cell.is-selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}

@media (max-width: 767px) {
  .calendar-cell {
    min-height: 40px;
  }

  .calendar-cell__day {
    font-size: 12px;
  }

  .calendar-cell__count {
    font-size: 10px;
  }
}
</style>
