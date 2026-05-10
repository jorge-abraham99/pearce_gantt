"use client";

import type { ReactNode } from "react";

import type { TimelineModel } from "@/lib/plannerViewModel";

export const DAY_WIDTH = 112;
export const ORDER_ROW_HEIGHT = 72;
export const WORKER_ROW_HEIGHT = 64;
export const LABEL_COLUMN_WIDTH = 240;

type GanttViewportProps = {
  timeline: TimelineModel;
  rowHeight: number;
  rowCount: number;
  labelHeader?: string;
  renderRowLabel: (index: number) => ReactNode;
  renderRowBars: (index: number) => ReactNode;
  onRowClick?: (index: number) => void;
  isRowSelected?: (index: number) => boolean;
  emptyState?: ReactNode;
};

export default function GanttViewport({
  timeline,
  rowHeight,
  rowCount,
  labelHeader = "",
  renderRowLabel,
  renderRowBars,
  onRowClick,
  isRowSelected,
  emptyState,
}: GanttViewportProps) {
  const timelineWidth = timeline.days.length * DAY_WIDTH;
  const totalGridWidth = LABEL_COLUMN_WIDTH + timelineWidth;
  const headerHeight = 44;

  if (rowCount === 0 && emptyState) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--panel)] p-10">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-auto bg-[var(--panel)]">
      <div style={{ width: totalGridWidth, minWidth: "100%" }}>
        <div
          className="sticky top-0 z-30 grid border-b border-[var(--line)] bg-[var(--panel-2)]"
          style={{
            gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px ${timelineWidth}px`,
            height: headerHeight,
          }}
        >
          <div
            className="sticky left-0 z-40 flex items-end border-r border-[var(--line)] bg-[var(--panel-2)] px-4 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]"
            style={{ width: LABEL_COLUMN_WIDTH }}
          >
            {labelHeader}
          </div>
          <div className="relative" style={{ width: timelineWidth }}>
            {timeline.days.map((day, index) => (
              <div
                key={day.iso}
                className="absolute top-0 flex h-full flex-col justify-end border-r border-[var(--line)] px-2 pb-1.5"
                style={{ left: index * DAY_WIDTH, width: DAY_WIDTH }}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  {weekdayLabel(day.date)}
                </div>
                <div
                  className={`text-sm font-semibold ${
                    day.isToday ? "text-[var(--accent)]" : "text-[var(--ink)]"
                  }`}
                >
                  {day.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          {Array.from({ length: rowCount }, (_, index) => {
            const isSelected = isRowSelected?.(index) ?? false;
            return (
              <div
                key={index}
                className={`grid border-b border-[var(--line)] ${
                  isSelected ? "bg-[var(--today-band)]" : ""
                }`}
                style={{
                  gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px ${timelineWidth}px`,
                }}
              >
                <button
                  type="button"
                  onClick={onRowClick ? () => onRowClick(index) : undefined}
                  className={`sticky left-0 z-20 flex items-center border-r border-[var(--line)] bg-[var(--panel)] px-4 text-left transition hover:bg-[var(--panel-2)] ${
                    onRowClick ? "cursor-pointer" : "cursor-default"
                  } ${isSelected ? "bg-[var(--panel-2)]" : ""}`}
                  style={{
                    width: LABEL_COLUMN_WIDTH,
                    height: rowHeight,
                  }}
                  disabled={!onRowClick}
                >
                  {renderRowLabel(index)}
                </button>
                <div
                  className="relative"
                  style={{
                    width: timelineWidth,
                    height: rowHeight,
                    backgroundImage: buildRowBackground(timeline),
                    backgroundRepeat: "no-repeat",
                  }}
                >
                  {renderRowBars(index)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function weekdayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
}

function buildRowBackground(timeline: TimelineModel): string {
  const layers: string[] = [];
  timeline.days.forEach((day, index) => {
    const left = index * DAY_WIDTH;
    if (day.isWeekend) {
      layers.push(
        `linear-gradient(var(--weekend), var(--weekend)) ${left}px 0/${DAY_WIDTH}px 100% no-repeat`,
      );
    }
    if (day.isToday) {
      layers.push(
        `linear-gradient(var(--today-band), var(--today-band)) ${left}px 0/${DAY_WIDTH}px 100% no-repeat`,
      );
    }
  });
  layers.push(
    `linear-gradient(to right, var(--line) 1px, transparent 1px) 0 0/${DAY_WIDTH}px 100% repeat-x`,
  );
  return layers.join(", ");
}
