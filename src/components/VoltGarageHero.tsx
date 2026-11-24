import { useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Compass, ShieldCheck, TrendingUp, Zap } from 'lucide-react';
import homeWallboxImg from '../assets/images/private_home_wallbox_1795443222640.jpg';
import fastHubImg from '../assets/images/company_fast_hub_1795443225006.jpg';
import { HeroCar3D } from './HeroCar3D';

interface VoltGarageHeroProps {
  onExploreClick: () => void;
  onHostClick: () => void;
}

type ShowcaseMode = '3d-bay' | 'residential' | 'commercial';

export function VoltGarageHero({ onExploreClick, onHostClick }: VoltGarageHeroProps) {
  const [showcaseMode, setShowcaseMode] = useState<ShowcaseMode>('3d-bay');
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

          {/* Right Column: Hardware & Live Telemetry Studio Showcase */}
          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-zinc-200/60">
              
              {/* Showcase Mode Segmented Switcher */}
              <div className="flex items-center justify-between bg-zinc-50/80 px-3 py-2">
                <div className="flex items-center gap-0.5 rounded-lg bg-zinc-200/70 p-0.5 text-xs font-medium overflow-x-auto scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setShowcaseMode('3d-bay')}
                    className={`inline-flex items-center gap-1 shrink-0 rounded-md px-2 py-1 transition-colors sm:gap-1.5 sm:px-2.5 ${
                      showcaseMode === '3d-bay'
                        ? 'bg-white font-semibold text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-600 shrink-0" />
                    <span className="whitespace-nowrap">3D Bay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowcaseMode('residential')}
                    className={`shrink-0 rounded-md px-2 py-1 transition-colors sm:px-2.5 ${
                      showcaseMode === 'residential'
                        ? 'bg-white font-semibold text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span className="whitespace-nowrap">Wallbox</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowcaseMode('commercial')}
                    className={`shrink-0 rounded-md px-2 py-1 transition-colors sm:px-2.5 ${
                      showcaseMode === 'commercial'
                        ? 'bg-white font-semibold text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span className="whitespace-nowrap">DC Hub</span>
                  </button>
                </div>

                <span className="hidden sm:inline font-mono text-[11px] font-medium text-emerald-700 whitespace-nowrap pl-2">
                  {showcaseMode === '3d-bay' ? 'Interactive 3D Twin' : showcaseMode === 'residential' ? '3.3 – 22 kW AC' : '50 – 150 kW DC'}
                </span>
              </div>

              {/* Showcase Display Area */}
              <div className="relative aspect-16/10 w-full overflow-hidden bg-zinc-100">
                {showcaseMode === '3d-bay' ? (
                  <HeroCar3D isCharging={sessionSimActive} onSessionToggle={setSessionSimActive} />
                ) : (
                  <>
                    <img
                      src={showcaseMode === 'residential' ? homeWallboxImg : fastHubImg}
                      alt={showcaseMode === 'residential' ? 'Private residential home wallbox' : 'Commercial fast DC hub'}
                      className="h-full w-full object-cover transition-opacity duration-300"
                    />

                    {/* Live Status Overlay Pill */}
                    <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-white/60 bg-white/95 px-3 py-1 text-xs font-mono backdrop-blur-md shadow-xs">
                      <span className={`h-2 w-2 rounded-full ${sessionSimActive ? 'bg-cyan-500 animate-pulse' : 'bg-emerald-500'}`} />
                      <span className="font-semibold text-zinc-800">
                        {sessionSimActive ? 'CHARGING IN PROGRESS' : 'BAY 01 · AVAILABLE'}
                      </span>
                    </div>

                    {/* Active Hold Countdown Badge */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-zinc-800/10 bg-zinc-900/90 px-2.5 py-1 text-[11px] font-mono text-white backdrop-blur-md">
                      <Clock className="h-3 w-3 text-emerald-400" />
                      <span>30m Hold Window</span>
                    </div>

                    {/* Bottom Telemetry Overlay Bar */}
                    <div className="absolute bottom-3 inset-x-3 rounded-xl border border-white/60 bg-white/95 p-3 backdrop-blur-md shadow-xs">
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-zinc-900">
                            {showcaseMode === 'residential' ? 'Marienplatz Residential Hub' : 'Schwabing DC Fast Terminal'}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {showcaseMode === 'residential' ? 'Elena Weber · Verified Private Host' : 'Partner Hub · 8 Bays Active'}
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="text-sm font-bold text-zinc-900 tabular-nums">
                            {showcaseMode === 'residential' ? '₹18.00' : '₹26.50'} <span className="text-[10px] text-zinc-500 font-normal">/ kWh</span>
                          </div>
                          <div className="text-[10px] text-emerald-700 font-medium">
                            {sessionSimActive ? 'Metering: 14.2 kWh' : 'Zero booking fee'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Interactive Telemetry & Simulation Controller */}
              <div className="bg-zinc-50/70 p-3 sm:p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-mono text-zinc-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="hidden sm:inline">OCPP 2.0.1 Meter:</span>
                    <span className="font-semibold text-zinc-900 tabular-nums">
                      {sessionSimActive 
                        ? (showcaseMode === 'commercial' ? '400V · 125A · 50 kW' : '230V · 32A · 7.4 kW')
                        : 'Standby · 230V Live'
                      }
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSessionSimActive((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-xs transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <Zap className="h-3 w-3 text-emerald-600" />
                    <span>{sessionSimActive ? 'Simulate Unplug' : 'Simulate Plug-In'}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Bottom Technical Specs Ribbon (Seamless Light Minimalist Architecture) */}
      <div className="bg-zinc-50/60 py-3.5">
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
