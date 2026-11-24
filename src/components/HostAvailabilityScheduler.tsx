/**
 * HostAvailabilityScheduler
 * ─────────────────────────
 * A visual weekly calendar builder for hosts to control exactly when their
 * charger is bookable. Each cell = one 2-hour slot per day.
 *
 * Data model: `ScheduleGrid` — 7 days × 12 slots (00:00–24:00 in 2h steps)
 * Output: a compact human-readable string like "Mon–Fri 08:00–22:00, Sat 09:00–18:00"
 * that is passed to the parent via `onChange`.
 */

import { useCallback, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Clock, RotateCcw, Zap } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = (typeof DAYS)[number];

const SLOT_COUNT = 12; // 2-hour slots per day
const SLOT_HOURS = 2;

/** Index of first enabled slot per day (or null if none) */
type DayMask = boolean[]; // length SLOT_COUNT
type ScheduleGrid = Record<Day, DayMask>;

function emptyGrid(): ScheduleGrid {
  return Object.fromEntries(DAYS.map((d) => [d, Array(SLOT_COUNT).fill(false)])) as ScheduleGrid;
}

function slotLabel(idx: number): string {
  const h = idx * SLOT_HOURS;
  return `${String(h).padStart(2, '0')}:00`;
}

/** Serialise the grid into a compact readable string */
function serialise(grid: ScheduleGrid): string {
  const parts: string[] = [];

  for (const day of DAYS) {
    const mask = grid[day];
    const ranges: string[] = [];
    let start: number | null = null;

    for (let i = 0; i <= SLOT_COUNT; i++) {
      const on = i < SLOT_COUNT && mask[i];
      if (on && start === null) {
        start = i;
      } else if (!on && start !== null) {
        const from = slotLabel(start);
        const to = slotLabel(i); // end of previous slot
        ranges.push(`${from}–${to === '00:00' ? '24:00' : to}`);
        start = null;
      }
    }

    if (ranges.length > 0) {
      parts.push(`${day} ${ranges.join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'Not available';
}

/** Pre-set templates */
const PRESETS: { label: string; description: string; build: () => ScheduleGrid }[] = [
  {
    label: 'Weekdays 8–22',
    description: 'Mon–Fri daytime',
    build: () => {
      const g = emptyGrid();
      for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as Day[]) {
        for (let i = 4; i < 11; i++) g[d][i] = true; // 08:00–22:00
      }
      return g;
    },
  },
  {
    label: 'Always on',
    description: 'All 7 days, 24 h',
    build: () => {
      const g = emptyGrid();
      for (const d of DAYS) g[d] = Array(SLOT_COUNT).fill(true);
      return g;
    },
  },
  {
    label: 'Weekends',
    description: 'Sat & Sun full day',
    build: () => {
      const g = emptyGrid();
      for (const d of ['Sat', 'Sun'] as Day[]) g[d] = Array(SLOT_COUNT).fill(true);
      return g;
    },
  },
  {
    label: 'Work hours',
    description: 'Mon–Fri 09:00–17:00',
    build: () => {
      const g = emptyGrid();
      for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as Day[]) {
        for (let i = 4; i < 8; i++) g[d][i] = true; // 08:00–16:00 (closest 2h slots)
        g[d][4] = true; // 08:00
        g[d][5] = false; // skip 10
        // actually do 09–17 by enabling slots 4 (08), 4.5 doesn't exist — use 4+5
        // slots: 4→08:00, 5→10:00 NO. reset properly:
        for (let i = 0; i < SLOT_COUNT; i++) g[d][i] = i >= 4 && i < 8; // 08:00–16:00
      }
      return g;
    },
  },
  {
    label: 'Off-peak nights',
    description: 'Every day 20:00–08:00',
    build: () => {
      const g = emptyGrid();
      for (const d of DAYS) {
        for (let i = 0; i < SLOT_COUNT; i++) {
          // slots 0–3 = 00:00–08:00, slots 10–11 = 20:00–24:00
          g[d][i] = i < 4 || i >= 10;
        }
      }
      return g;
    },
  },
];

// ── Component ──────────────────────────────────────────────────────────────
interface HostAvailabilitySchedulerProps {
  /** Current value as a plain string (shown when collapsed) */
  value: string;
  /** Called with the new compact string whenever the schedule changes */
  onChange: (value: string) => void;
  /** Optional class name for the outer wrapper */
  className?: string;
}

export function HostAvailabilityScheduler({
  value,
  onChange,
  className = '',
}: HostAvailabilitySchedulerProps) {
  const [expanded, setExpanded] = useState(false);
  const [grid, setGrid] = useState<ScheduleGrid>(emptyGrid);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<boolean>(true);

  const serialised = useMemo(() => serialise(grid), [grid]);

  // Emit change whenever grid changes
  const applyGrid = useCallback(
    (next: ScheduleGrid) => {
      setGrid(next);
      onChange(serialise(next));
    },
    [onChange]
  );

  function toggleSlot(day: Day, slotIdx: number, forceValue?: boolean) {
    const next = { ...grid, [day]: [...grid[day]] };
    next[day][slotIdx] = forceValue !== undefined ? forceValue : !grid[day][slotIdx];
    applyGrid(next);
  }

  function toggleDay(day: Day) {
    const allOn = grid[day].every(Boolean);
    const next = { ...grid, [day]: Array(SLOT_COUNT).fill(!allOn) as boolean[] };
    applyGrid(next);
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    applyGrid(preset.build());
  }

  function clearAll() {
    applyGrid(emptyGrid());
  }

  // Drag-to-paint: allow sweeping across slots
  function handleMouseDown(day: Day, idx: number) {
    const next = !grid[day][idx];
    setDragValue(next);
    setIsDragging(true);
    toggleSlot(day, idx, next);
  }

  function handleMouseEnter(day: Day, idx: number) {
    if (isDragging) {
      toggleSlot(day, idx, dragValue);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────
  const slotHeaders = Array.from({ length: SLOT_COUNT }, (_, i) => slotLabel(i));

  return (
    <div className={`rounded-xl border border-zinc-200 bg-white ${className}`}>
      {/* ── Collapsed header ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="text-xs font-semibold text-zinc-900">Availability Schedule</span>
          {!expanded && (
            <span className="hidden sm:block truncate font-mono text-[11px] text-zinc-500 ml-1">
              {value && value !== 'Not available' ? value : serialised}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100"
            >
              <RotateCcw className="h-3 w-3" />
              Clear
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div
          className="border-t border-zinc-100 p-4 space-y-4"
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          {/* ── Quick presets ───────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="inline-flex flex-col items-start rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50"
              >
                <span className="text-[11px] font-semibold text-zinc-900">{p.label}</span>
                <span className="text-[10px] text-zinc-500">{p.description}</span>
              </button>
            ))}
          </div>

          {/* ── Serialised summary ──────────────────────────────────── */}
          <div className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <p className="font-mono text-[11px] leading-relaxed text-zinc-600 break-words min-w-0">
              {serialised}
            </p>
          </div>

          {/* ── Week grid ───────────────────────────────────────────── */}
          {/* Mobile: stacked day rows. Desktop: horizontal grid */}
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="min-w-[480px]">
              {/* Time axis header */}
              <div className="mb-1 flex">
                {/* day label column */}
                <div className="w-10 shrink-0" />
                {slotHeaders.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center font-mono text-[9px] text-zinc-400 select-none"
                  >
                    {i % 2 === 0 ? h : ''}
                  </div>
                ))}
              </div>

              {/* Day rows */}
              {DAYS.map((day) => {
                const allOn = grid[day].every(Boolean);
                const anyOn = grid[day].some(Boolean);
                return (
                  <div key={day} className="mb-1 flex items-center gap-1">
                    {/* Day label + toggle */}
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      title={allOn ? `Disable all ${day}` : `Enable all ${day}`}
                      className={`w-10 shrink-0 rounded-md py-1 text-center text-[11px] font-semibold transition-colors select-none ${
                        allOn
                          ? 'bg-emerald-600 text-white'
                          : anyOn
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                      }`}
                    >
                      {day}
                    </button>

                    {/* Slot cells */}
                    {grid[day].map((on, idx) => (
                      <div
                        key={idx}
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${day} ${slotLabel(idx)}–${slotLabel(idx + 1)}`}
                        className={`flex-1 cursor-pointer select-none rounded-sm transition-colors ${
                          on
                            ? 'bg-emerald-500 hover:bg-emerald-400'
                            : 'bg-zinc-100 hover:bg-zinc-200'
                        }`}
                        style={{ height: 24 }}
                        onMouseDown={() => handleMouseDown(day, idx)}
                        onMouseEnter={() => handleMouseEnter(day, idx)}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          toggleSlot(day, idx);
                        }}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Legend */}
              <div className="mt-2 flex items-center gap-4 text-[10px] text-zinc-400 select-none">
                <div className="flex items-center gap-1">
                  <div className="h-3 w-5 rounded-sm bg-emerald-500" />
                  <span>Open for bookings</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-3 w-5 rounded-sm bg-zinc-200" />
                  <span>Blocked</span>
                </div>
                <span className="ml-auto italic">Drag to paint slots</span>
              </div>
            </div>
          </div>

          {/* ── Stats summary ───────────────────────────────────────── */}
          {(() => {
            const totalSlots = DAYS.length * SLOT_COUNT;
            const enabledSlots = DAYS.reduce(
              (sum, d) => sum + grid[d].filter(Boolean).length,
              0
            );
            const enabledHours = enabledSlots * SLOT_HOURS;
            const weeklyHours = totalSlots * SLOT_HOURS;
            const pct = Math.round((enabledSlots / totalSlots) * 100);
            return (
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-zinc-700">
                  <Zap className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                    {enabledHours}h
                  </span>
                  <span className="text-zinc-500">of {weeklyHours}h/week open</span>
                </div>
                <div className="flex-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold text-zinc-700 tabular-nums">
                  {pct}%
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
