"use client";

import type { ReactNode } from "react";

import { formatBankHolidayTitle } from "@/lib/bankHolidays";
import type { TimelineModel } from "@/lib/plannerViewModel";

export const DAY_WIDTH = 112;
export const WEEK_WIDTH = 168;
export const MONTH_WIDTH = 184;
export const ORDER_ROW_HEIGHT = 56;
export const ORDER_TASK_ROW_HEIGHT = 44;
export const WORKER_ROW_HEIGHT = 64;

export type LabelColumn = {
  key: string;
  header: string;
  width: number;
};

type GanttViewportProps = {
  timeline: TimelineModel;
  rowCount: number;
  rowHeight: number | ((index: number) => number);
  columns: LabelColumn[];
  renderRowCell: (rowIndex: number, columnKey: string) => ReactNode;
  renderRowBars: (rowIndex: number) => ReactNode;
  onRowClick?: (index: number) => void;
  isRowSelected?: (index: number) => boolean;
  isRowHighlighted?: (index: number) => boolean;
  rowClassName?: (index: number) => string;
  headerExtra?: ReactNode;
  emptyState?: ReactNode;
};

export default function GanttViewport({
  timeline,
  rowHeight,
  rowCount,
  columns,
  renderRowCell,
  renderRowBars,
  onRowClick,
  isRowSelected,
  isRowHighlighted,
  rowClassName,
  headerExtra,
  emptyState,
}: GanttViewportProps) {
  const unitWidth =
    timeline.scale === "month"
      ? MONTH_WIDTH
      : timeline.scale === "week"
        ? WEEK_WIDTH
        : DAY_WIDTH;
  const timelineWidth = timeline.units.length * unitWidth;
  const labelWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const totalGridWidth = labelWidth + timelineWidth;
  const headerHeight = 44;

  if (rowCount === 0 && emptyState) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--panel)] p-10">
        {emptyState}
      </div>
    );
  }

  const resolveHeight = (index: number): number =>
    typeof rowHeight === "function" ? rowHeight(index) : rowHeight;

  return (
    <div className="relative flex-1 overflow-auto bg-[var(--panel)]">
      <div style={{ width: totalGridWidth, minWidth: "100%" }}>
        <div
          className="sticky top-0 z-30 grid border-b border-[var(--line)] bg-[var(--panel-2)]"
          style={{
            gridTemplateColumns: `${labelWidth}px ${timelineWidth}px`,
            height: headerHeight,
          }}
        >
          <div
            className="sticky left-0 z-40 grid border-r border-[var(--line)] bg-[var(--panel-2)]"
            style={{
              width: labelWidth,
              gridTemplateColumns: columns
                .map((col) => `${col.width}px`)
                .join(" "),
            }}
          >
            {columns.map((col, index) => (
              <div
                key={col.key}
                className={`flex items-end px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] ${
                  index < columns.length - 1
                    ? "border-r border-[var(--line)]"
                    : ""
                }`}
              >
                {col.header}
              </div>
            ))}
          </div>
          <div className="relative" style={{ width: timelineWidth }}>
            {timeline.units.map((unit, index) => {
              const tooltipText =
                timeline.scale === "day" && unit.isBankHoliday
                  ? unit.bankHolidayTitles.map(formatBankHolidayTitle).join(", ")
                  : "";

              return (
                <div
                  key={unit.iso}
                  className="group absolute top-0 flex h-full flex-col justify-end border-r border-[var(--line)] px-2 pb-1.5"
                  style={{ left: index * unitWidth, width: unitWidth }}
                >
                  <div className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                    {unit.subLabel}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      unit.isCurrent ? "text-[var(--accent)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {unit.label}
                  </div>
                  {tooltipText ? (
                    <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--ink)] px-2 py-1 text-[10px] font-normal normal-case leading-tight text-white shadow-lg group-hover:block">
                      {tooltipText}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {headerExtra ? (
              <div className="pointer-events-none absolute right-2 top-1.5 z-50 flex items-start">
                <div className="pointer-events-auto">{headerExtra}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative">
          {Array.from({ length: rowCount }, (_, index) => {
            const selected = isRowSelected?.(index) ?? false;
            const highlighted = isRowHighlighted?.(index) ?? false;
            const height = resolveHeight(index);
            const extraClass = rowClassName?.(index) ?? "";
            return (
              <div
                key={index}
                className={`grid border-b border-[var(--line)] ${
                  selected
                    ? "bg-[var(--today-band)]"
                    : highlighted
                      ? "bg-[var(--panel-2)]"
                      : ""
                } ${extraClass}`}
                style={{
                  gridTemplateColumns: `${labelWidth}px ${timelineWidth}px`,
                }}
              >
                <div
                  className={`sticky left-0 z-20 grid border-r border-[var(--line)] ${
                    selected
                      ? "bg-[var(--today-band)]"
                      : highlighted
                        ? "bg-[var(--panel-2)]"
                        : "bg-[var(--panel)]"
                  }`}
                  style={{
                    width: labelWidth,
                    height,
                    gridTemplateColumns: columns
                      .map((col) => `${col.width}px`)
                      .join(" "),
                  }}
                >
                  {columns.map((col, colIndex) => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={
                        onRowClick ? () => onRowClick(index) : undefined
                      }
                      disabled={!onRowClick}
                      className={`flex items-center px-3 text-left transition hover:bg-[var(--panel-2)] ${
                        colIndex < columns.length - 1
                          ? "border-r border-[var(--line)]"
                          : ""
                      } ${onRowClick ? "cursor-pointer" : "cursor-default"}`}
                      style={{ height }}
                    >
                      {renderRowCell(index, col.key)}
                    </button>
                  ))}
                </div>
                <div
                  className="relative"
                  style={{
                    width: timelineWidth,
                    height,
                    background: buildRowBackground(timeline, unitWidth),
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

function buildRowBackground(
  timeline: TimelineModel,
  unitWidth: number,
): string {
  const layers: string[] = [];
  if (timeline.scale === "day") {
    timeline.units.forEach((unit, index) => {
      const left = index * unitWidth;
      if (unit.isWeekend) {
        layers.push(
          `linear-gradient(var(--weekend), var(--weekend)) ${left}px 0/${unitWidth}px 100% no-repeat`,
        );
      }
      if (unit.isBankHoliday) {
        layers.push(
          `linear-gradient(var(--bank-holiday), var(--bank-holiday)) ${left}px 0/${unitWidth}px 100% no-repeat`,
        );
      }
      if (unit.isCurrent) {
        layers.push(
          `linear-gradient(var(--today-band), var(--today-band)) ${left}px 0/${unitWidth}px 100% no-repeat`,
        );
      }
    });
  } else {
    timeline.units.forEach((unit, index) => {
      const left = index * unitWidth;
      if (unit.isCurrent) {
        layers.push(
          `linear-gradient(var(--today-band), var(--today-band)) ${left}px 0/${unitWidth}px 100% no-repeat`,
        );
      }
    });
  }
  // Strong gridline at each unit boundary.
  layers.push(
    `linear-gradient(to right, var(--line) 1px, transparent 1px) 0 0/${unitWidth}px 100% repeat-x`,
  );
  // In compressed scales, add faint internal guides to keep long schedules
  // readable without making every sub-period a full timeline column.
  if (timeline.scale === "week") {
    const subdivPx = unitWidth / 7;
    layers.push(
      `linear-gradient(to right, var(--line-faint) 1px, transparent 1px) 0 0/${subdivPx}px 100% repeat-x`,
    );
  } else if (timeline.scale === "month") {
    const subdivPx = unitWidth / 4;
    layers.push(
      `linear-gradient(to right, var(--line-faint) 1px, transparent 1px) 0 0/${subdivPx}px 100% repeat-x`,
    );
  }
  return layers.join(", ");
}
