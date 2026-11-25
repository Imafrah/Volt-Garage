import { MapPin, QrCode, Zap } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    icon: MapPin,
    title: 'Lock a verified bay',
    desc: 'Filter neighborhood wallboxes and DC hubs within 10 km. Reserve an atomic 30-minute hold so no one takes your stall en route.',
  },
  {
    num: '02',
    icon: QrCode,
    title: 'Arrive and scan QR',
    desc: 'Pull into the reserved bay and share your arrival token. Hosts capture the certified smart-meter start reading before unlocking.',
  },
  {
    num: '03',
    icon: Zap,
    title: 'Meter, settle, depart',
    desc: 'Live kWh consumption streams over OCPP 2.0.1. Unplug within the 15-minute grace window to settle with an automatic 80/20 split.',
  },
];

export function HowItWorks() {
  return (
    <section
      aria-label="How Volt Garage works"
      className="border-t border-zinc-200/70 bg-zinc-50/40"
    >
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              End-to-End Protocol Flow
            </span>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              How Volt Garage works
            </h2>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-zinc-600 sm:text-right">
            From guaranteed reservation to verified kWh settlement in three deterministic steps.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-2xs transition-colors hover:border-zinc-300"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-zinc-400">
                    STEP {step.num}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                  {step.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
