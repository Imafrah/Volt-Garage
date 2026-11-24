import { useState } from 'react';
import { ArrowDown, Maximize2, Minimize2, Sparkles, Zap, Shield, TrendingUp } from 'lucide-react';
import StillSunsetMeadow from './originkit/ui/still-sunset-meadow';

interface VoltGarageHeroProps {
  onExploreClick: () => void;
  onHostClick: () => void;
}

export function VoltGarageHero({ onExploreClick, onHostClick }: VoltGarageHeroProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-zinc-200/90 shadow-sm transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-none bg-black'
          : 'mb-6 h-[440px] sm:h-[480px] w-full'
      }`}
    >
      {/* 3D Interactive Meadow Background */}
      <div className="absolute inset-0 z-0">
        <StillSunsetMeadow />
      </div>

      {/* Atmospheric Vignette & Contrast Gradients for Content Legibility */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-zinc-950/80 via-zinc-950/35 to-zinc-950/20" />

      {/* Fullscreen Toggle Button */}
      <div className="absolute top-4 right-4 z-30">
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen 3D Meadow'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-zinc-950/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-zinc-900"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" />
              <span>Exit View</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Fullscreen Meadow</span>
            </>
          )}
        </button>
      </div>

      {/* Hero Content Overlay (Calm Left-Anchored Typography) */}
      {!isFullscreen && (
        <div className="relative z-20 flex h-full flex-col justify-between p-6 sm:p-10">
          {/* Top Pill */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-zinc-900/70 px-3 py-1 text-[11px] font-mono font-medium text-emerald-300 backdrop-blur-md">
              <Zap className="h-3 w-3 text-emerald-400 fill-emerald-400" />
              <span>P2P DECENTRALIZED CHARGING GRID</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-mono text-white/80 backdrop-blur-md">
              OCPP 2.0.1
            </span>
          </div>

          {/* Core Value Proposition & Headings */}
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-white drop-shadow-sm sm:leading-tight">
              Charge Anywhere. <br className="hidden sm:inline" />
              Monetize Your Driveway.
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-200/90 leading-relaxed max-w-xl drop-shadow-xs">
              Connect to verified neighborhood wallboxes and high-voltage DC hubs with guaranteed 30-minute holds, instant QR arrival check-in, and real-time metered telemetry.
            </p>

            {/* CTAs */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onExploreClick}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs sm:text-sm font-semibold text-zinc-950 shadow-md transition-all hover:bg-emerald-400 active:scale-[0.98]"
              >
                <span>Find Nearby Bay</span>
                <ArrowDown className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onHostClick}
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-zinc-900/70 px-4 py-2.5 text-xs sm:text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-zinc-900/90 active:scale-[0.98]"
              >
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span>Host ROI: Earn ₹8,000/wk</span>
              </button>
            </div>
          </div>

          {/* Bottom Live Metrics Strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4 max-w-2xl pt-2">
            <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-2 sm:p-2.5 backdrop-blur-md">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Power Range</div>
              <div className="font-mono text-xs sm:text-sm font-bold text-white tabular-nums">3.3 kW – 22 kW</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-2 sm:p-2.5 backdrop-blur-md">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Average Rate</div>
              <div className="font-mono text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">₹18 / kWh</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-2 sm:p-2.5 backdrop-blur-md">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Guaranteed Hold</div>
              <div className="font-mono text-xs sm:text-sm font-bold text-white tabular-nums">30 Minutes</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-2 sm:p-2.5 backdrop-blur-md">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Host Payout</div>
              <div className="font-mono text-xs sm:text-sm font-bold text-white tabular-nums">80% Settle</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
