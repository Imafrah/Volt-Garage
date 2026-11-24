import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Activity,
  Battery,
  BatteryCharging,
  CheckCircle2,
  Cpu,
  Gauge,
  Power,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';

interface PowerProfile {
  id: string;
  label: string;
  powerKw: number;
  voltage: number;
  currentAmps: number;
  phase: string;
  type: string;
  speedMultiplier: number;
}

const POWER_PROFILES: PowerProfile[] = [
  { id: '3.3kw', label: '3.3 kW Eco', powerKw: 3.3, voltage: 230, currentAmps: 16, phase: '1Φ AC', type: 'Residential Standard', speedMultiplier: 0.6 },
  { id: '7.4kw', label: '7.4 kW Wallbox', powerKw: 7.4, voltage: 230, currentAmps: 32, phase: '1Φ AC', type: 'Private Wallbox', speedMultiplier: 1.0 },
  { id: '22kw', label: '22 kW Rapid', powerKw: 22.0, voltage: 400, currentAmps: 32, phase: '3Φ AC', type: 'Commercial Fast', speedMultiplier: 2.2 },
  { id: '50kw', label: '50 kW DC', powerKw: 50.0, voltage: 400, currentAmps: 125, phase: 'DC High-V', type: 'Superhub DC', speedMultiplier: 4.5 },
];

export function InteractiveChargingDock() {
  const [isPlugged, setIsPlugged] = useState(true);
  const [profile, setProfile] = useState<PowerProfile>(POWER_PROFILES[1]);
  const [soc, setSoc] = useState(68);
  const [energyWh, setEnergyWh] = useState(14250);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Live ticking when plugged
  useEffect(() => {
    if (!isPlugged) return;
    const interval = setInterval(() => {
      setEnergyWh((prev) => prev + Math.round(profile.powerKw * 10 * profile.speedMultiplier));
      setSoc((prev) => (prev < 100 ? prev + (Math.random() > 0.65 ? 1 : 0) : 100));
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlugged, profile]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePos({ x, y });
  }

  // Calculate ETA to 80% / 100%
  const etaMinutes = useMemo(() => {
    const batteryCapacity = 78; // kWh
    const remainingKwh = ((100 - soc) / 100) * batteryCapacity;
    return Math.max(4, Math.round((remainingKwh / profile.powerKw) * 60));
  }, [soc, profile.powerKw]);

  // Tilt transforms based on mousePos (Originkit signature)
  const tiltX = isHovered ? (mousePos.y - 0.5) * -8 : 0;
  const tiltY = isHovered ? (mousePos.x - 0.5) * 8 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setMousePos({ x: 0.5, y: 0.5 });
      }}
      className="relative h-full w-full overflow-hidden rounded-xl bg-[#090b10] text-white select-none transition-transform duration-300 ease-out"
      style={{
        perspective: '1200px',
      }}
    >
      {/* ── Originkit Reactive Kinetic Grid & Spotlight ────────── */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(16, 185, 129, 0.16), transparent 70%)`,
        }}
      />

      {/* Kinetic Grid Pattern Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* ── Main Container (with subtle 3D tilt) ─────────────── */}
      <div
        className="relative z-10 flex h-full flex-col justify-between p-4 sm:p-5 transition-transform duration-200 ease-out"
        style={{
          transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
        }}
      >
        {/* Top Header: Telemetry Status & Power Mode Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg border font-mono text-xs transition-colors ${
                isPlugged
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}
            >
              <Zap className={`h-4 w-4 ${isPlugged ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-white">
                <span>{isPlugged ? 'OCPP SMART DOCK' : 'BAY 01 · STANDBY'}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-[10px] text-zinc-400 font-mono">
                {profile.type} · {profile.phase}
              </div>
            </div>
          </div>

          {/* Interactive Power Band Switcher */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11px] font-mono">
            {POWER_PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProfile(p)}
                className={`rounded px-2 py-1 transition-all ${
                  profile.id === p.id
                    ? 'bg-emerald-500 text-zinc-950 font-bold shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {p.label.split(' ')[0]} kW
              </button>
            ))}
          </div>
        </div>

        {/* ── Centerpiece: Interactive Kinetic EV Charging Bay Visualizer ── */}
        <div className="relative my-auto py-2">
          <svg viewBox="0 0 600 210" className="w-full h-auto drop-shadow-2xl">
            <defs>
              <linearGradient id="pedestalGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="carBody" x1="0%" y1="0%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#020617" />
              </linearGradient>
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Ground Grid Base Lines */}
            <ellipse cx="300" cy="180" rx="270" ry="24" fill="none" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="6 6" />
            <ellipse cx="300" cy="180" rx="210" ry="18" fill="none" stroke="#10b981" strokeWidth="1" strokeOpacity="0.3" />

            {/* ── Charging Pedestal (Left) ── */}
            <g transform="translate(90, 80)">
              {/* Stand Column */}
              <rect x="-14" y="0" width="28" height="95" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="2" />
              <rect x="-18" y="90" width="36" height="10" rx="3" fill="#1e293b" />

              {/* Status LED Halo Ring */}
              <circle
                cx="0"
                cy="28"
                r="16"
                fill="#020617"
                stroke={isPlugged ? '#10b981' : '#f59e0b'}
                strokeWidth="3"
                filter={isPlugged ? 'url(#neonGlow)' : undefined}
                className={isPlugged ? 'animate-pulse' : ''}
              />
              <text x="0" y="32" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="monospace">
                {profile.powerKw}k
              </text>

              {/* Smart Display Screen */}
              <rect x="-10" y="52" width="20" height="22" rx="3" fill="#020617" stroke="#1e293b" />
              <line x1="-6" y1="58" x2="6" y2="58" stroke="#10b981" strokeWidth="1.5" />
              <line x1="-6" y1="63" x2="2" y2="63" stroke="#38bdf8" strokeWidth="1.5" />
              <line x1="-6" y1="68" x2="4" y2="68" stroke="#94a3b8" strokeWidth="1" />
            </g>

            {/* ── High-Voltage Charging Cable with Kinetic Electron Particles ── */}
            {isPlugged ? (
              <g>
                {/* Thick Heavy Cable Path */}
                <path
                  d="M 104 115 C 130 170, 240 175, 295 118"
                  fill="none"
                  stroke="#020617"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M 104 115 C 130 170, 240 175, 295 118"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                {/* Flowing Energy Conduit Wave */}
                <path
                  d="M 104 115 C 130 170, 240 175, 295 118"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                  className="animate-pulse"
                />

                {/* Cable Lock Ingress Plug */}
                <circle cx="295" cy="118" r="5" fill="#34d399" filter="url(#neonGlow)" />
              </g>
            ) : (
              /* Draped Disconnected Cable */
              <path
                d="M 104 115 C 115 150, 110 165, 105 175"
                fill="none"
                stroke="#475569"
                strokeWidth="4"
                strokeLinecap="round"
              />
            )}

            {/* ── Modern EV Sedan Silhouette (Center-Right) ── */}
            <g transform="translate(290, 75)">
              {/* Car Body Shadow */}
              <ellipse cx="130" cy="100" rx="135" ry="14" fill="#000000" opacity="0.6" />

              {/* Wheels */}
              <g transform="translate(35, 90)">
                <circle cx="0" cy="0" r="19" fill="#020617" stroke="#334155" strokeWidth="3" />
                <circle cx="0" cy="0" r="10" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="4" fill="#38bdf8" />
              </g>
              <g transform="translate(210, 90)">
                <circle cx="0" cy="0" r="19" fill="#020617" stroke="#334155" strokeWidth="3" />
                <circle cx="0" cy="0" r="10" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="4" fill="#38bdf8" />
              </g>

              {/* Aerodynamic Sedan Body Profile */}
              <path
                d="M 0 75 L 18 50 C 35 48, 60 48, 85 45 L 140 15 C 180 15, 215 32, 235 46 L 255 60 C 265 65, 268 75, 265 82 L 250 86 C 240 76, 230 76, 210 76 C 190 76, 180 86, 175 88 L 65 88 C 60 76, 50 76, 35 76 C 20 76, 15 86, 10 88 Z"
                fill="url(#carBody)"
                stroke="#334155"
                strokeWidth="1.5"
              />

              {/* Tinted Aerodynamic Glass Roof */}
              <path
                d="M 90 44 L 138 18 C 175 18, 205 32, 222 44 Z"
                fill="#0f172a"
                stroke="#10b981"
                strokeWidth="1"
                strokeOpacity="0.4"
              />

              {/* Illuminated Headlight Blade */}
              <path
                d="M 252 64 L 264 69"
                stroke="#38bdf8"
                strokeWidth="3"
                strokeLinecap="round"
                filter="url(#neonGlow)"
              />

              {/* Rear Tail Light Blade */}
              <path
                d="M 2 73 L 14 62"
                stroke="#f43f5e"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Active Charging Port Halo */}
              <circle
                cx="6"
                cy="43"
                r="6"
                fill="#0f172a"
                stroke={isPlugged ? '#10b981' : '#64748b'}
                strokeWidth="2"
                filter={isPlugged ? 'url(#neonGlow)' : undefined}
              />
              {isPlugged && (
                <circle cx="6" cy="43" r="2" fill="#34d399" className="animate-ping" />
              )}
            </g>
          </svg>
        </div>

        {/* ── Bottom HUD: Live Energy Telemetry Strip ──────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-white/10 pt-3 text-xs font-mono">
          {/* SoC Progress */}
          <div className="rounded-lg bg-white/5 p-2 border border-white/5">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span className="flex items-center gap-1">
                <BatteryCharging className="h-3 w-3 text-emerald-400" />
                STATE OF CHARGE
              </span>
              <span className="font-bold text-white">{soc}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${soc}%` }}
              />
            </div>
          </div>

          {/* Active Power Delivery */}
          <div className="rounded-lg bg-white/5 p-2 border border-white/5">
            <div className="text-[10px] text-zinc-400 flex items-center justify-between">
              <span>OUTPUT RATE</span>
              <span className="text-emerald-400 font-bold">{isPlugged ? `${profile.powerKw} kW` : '0 kW'}</span>
            </div>
            <div className="mt-1 font-bold text-white tabular-nums">
              {isPlugged ? `${profile.voltage}V · ${profile.currentAmps}A` : 'Standby'}
            </div>
          </div>

          {/* Cumulative Metering */}
          <div className="rounded-lg bg-white/5 p-2 border border-white/5">
            <div className="text-[10px] text-zinc-400 flex items-center justify-between">
              <span>METER DELIVERED</span>
              <span className="text-zinc-500">OCPP 2.0.1</span>
            </div>
            <div className="mt-1 font-bold text-emerald-400 tabular-nums">
              +{(energyWh / 1000).toFixed(2)} kWh
            </div>
          </div>

          {/* Interactive Plug / Unplug Tactile Button */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setIsPlugged((prev) => !prev)}
              className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition-all shadow-md ${
                isPlugged
                  ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-white/10'
                  : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-black'
              }`}
            >
              <Power className={`h-3.5 w-3.5 ${isPlugged ? 'text-zinc-400' : 'text-zinc-950'}`} />
              <span>{isPlugged ? 'Release Cable' : 'Snap Dock Cable'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
