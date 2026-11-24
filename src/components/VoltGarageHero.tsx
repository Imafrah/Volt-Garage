import { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle2, Clock, Compass, Cpu, ShieldCheck, TrendingUp, Zap } from 'lucide-react';
import homeWallboxImg from '../assets/images/private_home_wallbox_1795443222640.jpg';
import fastHubImg from '../assets/images/company_fast_hub_1795443225006.jpg';

interface VoltGarageHeroProps {
  onExploreClick: () => void;
  onHostClick: () => void;
}

type ShowcaseMode = 'residential' | 'commercial' | 'schematic';

function PowerCircuitSchematic({ isCharging }: { isCharging: boolean }) {
  const [soc, setSoc] = useState(68);
  const [energyDelivered, setEnergyDelivered] = useState(14.25);

  useEffect(() => {
    if (!isCharging) return;
    const interval = setInterval(() => {
      setEnergyDelivered((e) => Number((e + 0.01).toFixed(2)));
      setSoc((s) => (s < 100 ? s + 1 : s));
    }, 2500);
    return () => clearInterval(interval);
  }, [isCharging]);

  return (
    <div className="relative h-full w-full bg-[#0a0d14] text-white p-4 sm:p-5 flex flex-col justify-between font-mono select-none">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isCharging ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="font-bold text-white tracking-wide">
            {isCharging ? 'OCPP 2.0.1 TELEMETRY BUS · ACTIVE' : 'EVSE STANDBY · IDLE'}
          </span>
        </div>
        <span className="text-zinc-400 text-[11px] hidden sm:inline">TX-9428 · Type-2 Mennekes</span>
      </div>

      {/* SVG Circuit Schematic */}
      <div className="my-auto py-2">
        <svg viewBox="0 0 540 180" className="w-full h-auto">
          {/* Base Connection Bus Line */}
          <path
            d="M 80 90 L 210 90 L 330 90 L 450 90"
            fill="none"
            stroke="#1e293b"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Animated Pulsing Current Line */}
          {isCharging && (
            <path
              d="M 80 90 L 210 90 L 330 90 L 450 90"
              fill="none"
              stroke="#10b981"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="12 8"
              className="animate-pulse"
            />
          )}

          {/* Node 1: Grid AC Supply */}
          <g transform="translate(45, 90)">
            <rect x="-38" y="-35" width="76" height="70" rx="8" fill="#131722" stroke="#334155" strokeWidth="1.5" />
            <text x="0" y="-12" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">GRID AC</text>
            <text x="0" y="8" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="bold">230 V</text>
            <text x="0" y="24" textAnchor="middle" fill="#64748b" fontSize="9">50 Hz · 1Φ</text>
          </g>

          {/* Node 2: Wallbox Smart Controller */}
          <g transform="translate(210, 90)">
            <rect x="-45" y="-40" width="90" height="80" rx="8" fill="#131722" stroke={isCharging ? '#10b981' : '#334155'} strokeWidth="1.5" />
            <text x="0" y="-18" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="bold">WALLBOX</text>
            <text x="0" y="4" textAnchor="middle" fill="#f8fafc" fontSize="14" fontWeight="bold">7.4 kW</text>
            <text x="0" y="22" textAnchor="middle" fill="#94a3b8" fontSize="9">32A Metered</text>
          </g>

          {/* Node 3: Smart Interlock Cable */}
          <g transform="translate(330, 90)">
            <circle cx="0" cy="0" r="18" fill="#131722" stroke={isCharging ? '#34d399' : '#475569'} strokeWidth="1.5" />
            <text x="0" y="3" textAnchor="middle" fill="#34d399" fontSize="9" fontWeight="bold">LOCK</text>
            <text x="0" y="28" textAnchor="middle" fill="#64748b" fontSize="8">PWM Pilot</text>
          </g>

          {/* Node 4: EV Battery Pack */}
          <g transform="translate(450, 90)">
            <rect x="-48" y="-40" width="96" height="80" rx="8" fill="#131722" stroke={isCharging ? '#10b981' : '#334155'} strokeWidth="1.5" />
            <text x="0" y="-18" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">BATTERY</text>
            <text x="0" y="5" textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="bold">{soc}%</text>
            <text x="0" y="22" textAnchor="middle" fill="#10b981" fontSize="9">78 kWh Pack</text>
          </g>
        </svg>
      </div>

      {/* Bottom Live Metrics Bar */}
      <div className="grid grid-cols-4 gap-2 border-t border-white/10 pt-2.5 text-[11px] text-zinc-400">
        <div>
          <span className="block text-zinc-500 text-[10px]">CURRENT</span>
          <span className="font-bold text-white tabular-nums">{isCharging ? '32.1 A' : '0.0 A'}</span>
        </div>
        <div>
          <span className="block text-zinc-500 text-[10px]">VOLTAGE</span>
          <span className="font-bold text-white tabular-nums">230.4 V</span>
        </div>
        <div>
          <span className="block text-zinc-500 text-[10px]">DELIVERED</span>
          <span className="font-bold text-emerald-400 tabular-nums">+{energyDelivered} kWh</span>
        </div>
        <div>
          <span className="block text-zinc-500 text-[10px]">CELL TEMP</span>
          <span className="font-bold text-white tabular-nums">28.5 °C</span>
        </div>
      </div>
    </div>
  );
}

export function VoltGarageHero({ onExploreClick, onHostClick }: VoltGarageHeroProps) {
  const [showcaseMode, setShowcaseMode] = useState<ShowcaseMode>('residential');
  const [sessionSimActive, setSessionSimActive] = useState(true);

  return (
    <section aria-label="Volt Garage Platform Overview" className="relative w-full bg-white text-zinc-900">
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          
          {/* Left Column: Product Positioning, Proof Points & CTAs */}
          <div className="space-y-6 lg:col-span-7">
            {/* Quiet Infrastructure Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span>P2P EV Charging Network</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-mono text-zinc-600">
                OCPP 2.0.1 Compliant
              </span>
            </div>

            {/* Main Headline & Subhead */}
            <div className="space-y-3">
              <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-zinc-900 leading-[1.08]">
                Charge anywhere. <br className="hidden sm:inline" />
                <span className="text-emerald-600">Monetize your driveway.</span>
              </h1>
              <p className="text-base sm:text-lg text-zinc-600 leading-relaxed max-w-xl">
                Connect to verified neighborhood wallboxes and high-voltage DC hubs. Enjoy 30-minute guaranteed holds, zero-wait QR check-in, and automated metered billing with 10 km geofence protection.
              </p>
            </div>

            {/* Real-World Proof Point (Bengaluru Case Study Benchmark) */}
            <div className="flex items-center gap-3.5 rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-3.5 text-xs text-zinc-700 max-w-xl">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="leading-snug">
                <span className="font-semibold text-zinc-900">Host Earnings Benchmark:</span>{' '}
                Neighborhood hosts earn up to <span className="font-mono font-semibold text-emerald-800 tabular-nums">₹8,000/week</span> on standard 3.3 kW residential connections with automated weekly settlements.
              </div>
            </div>

            {/* Action CTAs */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onExploreClick}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
              >
                <span>Find Nearby Chargers</span>
                <Compass className="h-4 w-4 text-zinc-300" />
              </button>

              <button
                type="button"
                onClick={onHostClick}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
              >
                <span>Calculate Host ROI</span>
                <ArrowRight className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            {/* Trust Meta Signals */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-zinc-500">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>30-minute locked hold</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>10 km proximity geofence</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-emerald-600" />
                <span>Real-time smart meter sync</span>
              </div>
            </div>
          </div>

          {/* Right Column: Clean High-Craft Showcase Card */}
          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-2 sm:p-2.5 shadow-xl shadow-zinc-200/40">

              {/* ── Top Tab Bar: Segmented Switcher ─────────────────── */}
              <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-3 py-2 rounded-t-xl mb-2">
                <div className="flex items-center gap-1 rounded-lg bg-zinc-200/60 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setShowcaseMode('residential')}
                    className={`inline-flex items-center gap-1.5 shrink-0 rounded-md px-3 py-1.5 transition-all ${
                      showcaseMode === 'residential'
                        ? 'bg-white font-semibold text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span>Residential Wallbox</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowcaseMode('commercial')}
                    className={`shrink-0 rounded-md px-3 py-1.5 transition-all ${
                      showcaseMode === 'commercial'
                        ? 'bg-white font-semibold text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span>Commercial Fast Hub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowcaseMode('schematic')}
                    className={`inline-flex items-center gap-1.5 shrink-0 rounded-md px-3 py-1.5 transition-all ${
                      showcaseMode === 'schematic'
                        ? 'bg-white font-semibold text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Cpu className="h-3 w-3 text-emerald-600" />
                    <span>Power Circuit</span>
                  </button>
                </div>

                <div className="hidden sm:flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono text-[10px] font-semibold text-emerald-700 tracking-wider">
                    {showcaseMode === 'residential' ? '3.3–22 kW AC' : showcaseMode === 'commercial' ? '50–150 kW DC' : 'OCPP BUS'}
                  </span>
                </div>
              </div>

              {/* ── Main Viewport ───────────────────────────── */}
              <div className="relative w-full overflow-hidden rounded-xl bg-zinc-950" style={{ aspectRatio: '16/10' }}>
                {showcaseMode === 'schematic' ? (
                  <PowerCircuitSchematic isCharging={sessionSimActive} />
                ) : (
                  <>
                    <img
                      src={showcaseMode === 'residential' ? homeWallboxImg : fastHubImg}
                      alt={showcaseMode === 'residential' ? 'Private residential home wallbox' : 'Commercial fast DC hub'}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

                    {/* Live Status Pill */}
                    <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-1 backdrop-blur-md">
                      <span className={`h-2 w-2 rounded-full ${sessionSimActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'}`} />
                      <span className="font-mono text-[11px] font-semibold tracking-wide text-white">
                        {sessionSimActive ? 'CHARGING IN PROGRESS' : 'BAY 01 · STANDBY'}
                      </span>
                    </div>

                    {/* Guaranteed Hold Window Badge */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 backdrop-blur-md">
                      <Clock className="h-3 w-3 text-emerald-400" />
                      <span className="font-mono text-[10px] text-white/90">30m Hold Window</span>
                    </div>

                    {/* Bottom Station Details Card */}
                    <div className="absolute bottom-0 inset-x-0 border-t border-white/10 bg-black/75 px-4 py-3 backdrop-blur-md">
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <div>
                          <div className="font-semibold text-white">
                            {showcaseMode === 'residential' ? 'Marienplatz Residential Hub' : 'Schwabing DC Fast Terminal'}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-300 mt-0.5">
                            {showcaseMode === 'residential' ? 'Elena Weber · Verified Private Host' : 'Partner Hub · 8 Bays Active'}
                          </div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <div className="text-sm font-bold tabular-nums text-white">
                            {showcaseMode === 'residential' ? '₹18.00' : '₹26.50'}
                            <span className="text-[10px] font-normal text-zinc-300 ml-1">/ kWh</span>
                          </div>
                          <div className="text-[10px] text-emerald-400 font-semibold">
                            {sessionSimActive ? 'Metering: 14.2 kWh' : 'Zero booking fee'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ── Bottom Control Strip ─────────────────────── */}
              <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-3 py-2.5 rounded-b-xl mt-2">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-zinc-500 hidden sm:inline">OCPP 2.0.1</span>
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {sessionSimActive
                      ? (showcaseMode === 'commercial' ? '400V · 125A · 50 kW' : '230V · 32A · 7.4 kW')
                      : 'Standby · 230V Live'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSessionSimActive((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    sessionSimActive
                      ? 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs'
                  }`}
                >
                  <Zap className={`h-3.5 w-3.5 ${sessionSimActive ? 'text-zinc-500' : 'text-white'}`} />
                  <span>{sessionSimActive ? 'Simulate Unplug' : 'Simulate Plug-In'}</span>
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Bottom Technical Specs Ribbon (Seamless Light Minimalist Architecture) */}
      <div className="bg-zinc-50/60 py-3.5 border-t border-zinc-200/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-6 text-xs">
            
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-800 font-mono text-[11px] font-semibold">
                AC
              </div>
              <div>
                <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide">Power Band</div>
                <div className="font-mono font-medium text-zinc-900 tabular-nums text-xs">3.3 – 150 kW</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-800 font-mono text-[11px] font-semibold">
                ₹
              </div>
              <div>
                <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide">Community Tariff</div>
                <div className="font-mono font-medium text-zinc-900 tabular-nums text-xs">₹18.00 / kWh</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-800 font-mono text-[11px] font-semibold">
                30m
              </div>
              <div>
                <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide">Hold Window</div>
                <div className="font-medium text-zinc-900 text-xs">Guaranteed</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-800 font-mono text-[11px] font-semibold">
                80%
              </div>
              <div>
                <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide">Host Settlement</div>
                <div className="font-medium text-zinc-900 text-xs">Weekly Auto</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
