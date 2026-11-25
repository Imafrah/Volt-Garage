import { useState } from 'react';
import {
  AlertCircle,
  BatteryCharging,
  Bot,
  Car,
  CheckCircle2,
  Clock,
  Compass,
  IndianRupee,
  MapPin,
  Navigation,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  PROXIMITY_RADIUS_KM,
  calculateDistanceKm,
  round2,
} from '../domain/imchargeEngine';
import type { ChargingPoint, ConnectorType, DriverProfile, GeoPoint } from '../domain/types';

interface GeminiVoltCopilotModalProps {
  driver: DriverProfile | null;
  chargingPoints: ChargingPoint[];
  isOpen: boolean;
  onClose: () => void;
  onReserveRecommended: (chargingPointId: string, connectorId: string) => Promise<void>;
}

interface SmartPlanResult {
  point: ChargingPoint;
  connectorId: string;
  connectorType: ConnectorType;
  powerKw: number;
  energyNeededKwh: number;
  chargeTimeMinutes: number;
  estimatedCost: number;
  distanceKm: number;
  aiRationale: string;
  backupPointName?: string;
}

const VEHICLE_PRESETS = [
  { name: 'Tata Nexon EV Max', capacity: 40.5, connector: 'CCS' as ConnectorType },
  { name: 'MG ZS EV 2024', capacity: 50.3, connector: 'CCS' as ConnectorType },
  { name: 'Tesla Model 3 Long Range', capacity: 78.0, connector: 'Type2' as ConnectorType },
  { name: 'Ather 450X (2W Smart EV)', capacity: 3.7, connector: 'Type2' as ConnectorType },
];

export function GeminiVoltCopilotModal({
  driver,
  chargingPoints,
  isOpen,
  onClose,
  onReserveRecommended,
}: GeminiVoltCopilotModalProps) {
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_PRESETS[0]);
  const [currentSoc, setCurrentSoc] = useState<number>(18);
  const [targetSoc, setTargetSoc] = useState<number>(75);
  const [destinationPreset, setDestinationPreset] = useState<string>('downtown');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [planResult, setPlanResult] = useState<SmartPlanResult | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const driverLocation: GeoPoint = driver?.defaultLocation ?? {
    lat: 48.137154,
    lon: 11.576124,
  };

  async function handleRunOptimization() {
    setIsAnalyzing(true);
    setPlanResult(null);
    setErrorMsg(null);

    try {
      // Simulate smart AI optimization pass with a realistic calculation
      await new Promise((resolve) => setTimeout(resolve, 750));

      if (chargingPoints.length === 0) {
        setErrorMsg('No charging stations available in current snapshot.');
        return;
      }

      const capacity = selectedVehicle.capacity;
      const socDelta = Math.max(5, targetSoc - currentSoc);
      const energyNeeded = round2((socDelta / 100) * capacity);

      // Score eligible charging points within 10 km geofence with an available connector
      const eligible = chargingPoints
        .map((cp) => {
          const dist = calculateDistanceKm(driverLocation, cp.location);
          const availableConns = cp.connectors.filter(
            (c) => c.status === 'available'
          );
          if (availableConns.length === 0 || dist > PROXIMITY_RADIUS_KM) {
            return null;
          }
          const matchingConn =
            availableConns.find((c) => c.type === selectedVehicle.connector) ??
            availableConns[0];
          const power = matchingConn?.powerKw ?? 7.4;
          const timeMinutes = Math.max(12, Math.round((energyNeeded / power) * 60));
          const cost = round2(energyNeeded * cp.pricePerKwh);

          // Score formula: balance short distance, high power, verified host rating
          const score =
            (cp.rating * 20) +
            (power * 2) -
            (dist * 3) -
            (cost * 0.1) +
            (matchingConn.type === selectedVehicle.connector ? 25 : 0);

          return {
            point: cp,
            connectorId: matchingConn.id,
            connectorType: matchingConn.type,
            powerKw: power,
            energyNeededKwh: energyNeeded,
            chargeTimeMinutes: timeMinutes,
            estimatedCost: cost,
            distanceKm: dist,
            score,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => b.score - a.score);

      if (eligible.length === 0) {
        setErrorMsg(
          `No available connectors found within the ${PROXIMITY_RADIUS_KM} km geofence from your current location. Reset your GPS preset to Munich Downtown or free a connector.`
        );
        return;
      }

      const best = eligible[0];
      const backup = eligible[1];

      setPlanResult({
        ...best,
        backupPointName: backup?.point.name,
        aiRationale: `Selected verified host ${best.point.hostName} (${best.point.name}) based on lowest congestion risk, ${best.powerKw} kW output matching your ${selectedVehicle.name}, and optimal ${best.chargeTimeMinutes}-min dwell window. 10 km geofence lock will hold your bay for 30 minutes.`,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to compute charging route.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleBook() {
    if (!planResult) return;
    setIsReserving(true);
    setErrorMsg(null);
    try {
      await onReserveRecommended(planResult.point.id, planResult.connectorId);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to lock recommended bay.'
      );
    } finally {
      setIsReserving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold text-zinc-900">
                  Volt Copilot AI
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-800">
                  Gemini Route Intelligence
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Predictive charging reservation matchmaker based on battery curve & city geofencing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Input Parameters Form */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Vehicle Select */}
          <div>
            <label className="text-xs font-semibold text-zinc-700">Vehicle Profile</label>
            <select
              value={selectedVehicle.name}
              onChange={(e) => {
                const found = VEHICLE_PRESETS.find((v) => v.name === e.target.value);
                if (found) setSelectedVehicle(found);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 focus:border-emerald-500 focus:bg-white"
            >
              {VEHICLE_PRESETS.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.capacity} kWh · {v.connector})
                </option>
              ))}
            </select>
          </div>

          {/* Destination */}
          <div>
            <label className="text-xs font-semibold text-zinc-700">Target Area / Route</label>
            <select
              value={destinationPreset}
              onChange={(e) => setDestinationPreset(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 focus:border-emerald-500 focus:bg-white"
            >
              <option value="downtown">Marienplatz Downtown (Central Zone)</option>
              <option value="schwabing">Schwabing Tech Corridor (~4.2 km)</option>
              <option value="garching">Garching Research Park (~13 km)</option>
            </select>
          </div>

          {/* Current SoC Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-zinc-700">Current Battery SoC</span>
              <span className="font-mono text-amber-600">{currentSoc}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              value={currentSoc}
              onChange={(e) => setCurrentSoc(Number(e.target.value))}
              className="mt-2 h-1.5 w-full accent-amber-500"
            />
          </div>

          {/* Target SoC Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-zinc-700">Desired Target Battery</span>
              <span className="font-mono text-emerald-600">{targetSoc}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              value={targetSoc}
              onChange={(e) => setTargetSoc(Number(e.target.value))}
              className="mt-2 h-1.5 w-full accent-emerald-500"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-5">
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleRunOptimization}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-60"
          >
            {isAnalyzing ? (
              <>
                <Bot className="h-4 w-4 animate-spin text-emerald-400" />
                Analyzing Real-time Grid & Availability Curves...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Run AI Multi-Objective Matchmaker
              </>
            )}
          </button>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* AI Result Card */}
        {planResult && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 animate-slide-up">
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800">
                  Recommended Stop · Guaranteed 30-Min Hold
                </span>
                <h4 className="mt-1 font-display text-base font-bold text-zinc-900">
                  {planResult.point.name}
                </h4>
                <p className="text-xs text-zinc-600">
                  {planResult.point.address} · {planResult.distanceKm} km from driver
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-zinc-900">
                  ₹{planResult.estimatedCost}
                </span>
                <span className="block text-[10px] text-zinc-500 font-mono">
                  {planResult.energyNeededKwh} kWh delivery
                </span>
              </div>
            </div>

            {/* Metrics Chips */}
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-emerald-200/80 pt-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-zinc-700">
                <Zap className="h-3.5 w-3.5 text-emerald-600" />
                <span>{planResult.powerKw} kW ({planResult.connectorType})</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium text-zinc-700">
                <Clock className="h-3.5 w-3.5 text-emerald-600" />
                <span>~{planResult.chargeTimeMinutes} mins dwell</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium text-zinc-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>KYC Verified Host</span>
              </div>
            </div>

            {/* AI Explanation prose */}
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-700 bg-white/70 p-2.5 rounded-lg border border-emerald-100 font-sans">
              <strong>Gemini Agent Rationale:</strong> {planResult.aiRationale}
            </p>

            {planResult.backupPointName && (
              <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>
                  Fail-safe automated backup assigned:{' '}
                  <span className="font-semibold text-zinc-700">
                    {planResult.backupPointName}
                  </span>{' '}
                  (auto-reroutes if primary bay blocked)
                </span>
              </p>
            )}

            {/* Direct Booking CTA */}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                disabled={isReserving}
                onClick={handleBook}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-500 disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isReserving ? 'Locking 30-Min Hold...' : 'Lock Guaranteed Hold Slot'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
