import { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  MapPin,
  Play,
  RotateCcw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import type { GeoPoint, PlatformSnapshot } from '../domain/types';

interface JudgeScenarioSelectorProps {
  onRunScenario: (scenarioId: string) => Promise<void>;
  isBusy?: boolean;
}

const SCENARIOS = [
  {
    id: 'residential_booking',
    title: 'Scenario 1: Guaranteed Hold & QR Check-In',
    badge: 'Core Workflow',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    description:
      'Reserves neighborhood wallbox with atomic 30-min hold & generates driver QR token.',
  },
  {
    id: 'geofence_release',
    title: 'Scenario 2: 10 km Geofence Auto-Release',
    badge: 'Proximity Engine',
    color: 'text-rose-700 bg-rose-50 border-rose-200',
    description:
      'Moves driver to Airport (~29 km). Engine automatically unreserves hold to protect host.',
  },
  {
    id: 'idle_overstay',
    title: 'Scenario 3: Driveway Hogging & Idle Fee Active',
    badge: 'Host Protection',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    description:
      'Simulates charge completed 35m ago. Grace period passed -> ₹50 idle fee charged to driver.',
  },
  {
    id: 'hardware_fault',
    title: 'Scenario 4: OCPP Telemetry Walk-in Tamper',
    badge: 'Hardware Protocol',
    color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    description:
      'Injects unbooked walk-in load via simulated OCPP 2.0.1 frame; system resolves conflict.',
  },
];

export function JudgeScenarioSelector({
  onRunScenario,
  isBusy = false,
}: JudgeScenarioSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSelect(id: string) {
    setActiveScenario(id);
    setIsOpen(false);
    await onRunScenario(id);
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        disabled={isBusy}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/80 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100/80"
        title="1-Click Pitch Scenarios for Hackathon Judges"
      >
        <Award className="h-3.5 w-3.5 text-emerald-600" />
        <span className="hidden sm:inline">Prototye Scenarios</span>
        <span className="sm:hidden">Scenarios</span>
        <ChevronDown className="h-3 w-3 text-emerald-700" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl z-50 animate-slide-up">
          <div className="border-b border-zinc-100 px-3 py-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
              Techthon Live Demo Pitch Scripts
            </span>
            <p className="text-xs text-zinc-600">
              Trigger instant multi-party states without manual data entry
            </p>
          </div>

          <div className="mt-1 space-y-1">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s.id)}
                className={`w-full rounded-lg p-2.5 text-left transition-colors hover:bg-zinc-50 flex flex-col gap-1 ${activeScenario === s.id ? 'bg-zinc-50 ring-1 ring-emerald-500/30' : ''
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 font-display">
                    {s.title}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-mono font-semibold ${s.color}`}
                  >
                    {s.badge}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-tight">
                  {s.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
