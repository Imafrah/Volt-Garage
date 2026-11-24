import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Map,
  MapPin,
  Navigation,
  Plus,
  QrCode,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react';
import {
  calculateMeteredBilling,
  estimateEtaMinutes,
} from '../domain/imchargeEngine';
import type {
  BackupConnectorSuggestion,
  ChargingPoint,
  ChargingSession,
  ConnectorType,
  DriverProfile,
  LiveTelemetryReading,
  PaymentRecord,
  Reservation,
  Vehicle,
} from '../domain/types';
import { ChargerBay3D } from './ChargerBay3D';
import { VehicleShowroom3D } from './VehicleShowroom3D';

interface DriverTripsViewProps {
  driver: DriverProfile;
  chargingPoints: ChargingPoint[];
  reservations: Reservation[];
  sessions: ChargingSession[];
  payments: PaymentRecord[];
  liveTelemetry: Record<string, LiveTelemetryReading>;
  onAddVehicle: (payload: Omit<Vehicle, 'id'>) => Promise<void>;
  onConfirmReservation: (resId: string, qrToken: string) => Promise<void>;
  onCancelReservation: (resId: string) => Promise<void>;
  onReportBlockedBay: (
    resId: string
  ) => Promise<BackupConnectorSuggestion | null>;
  onReserveBackup: (
    chargingPointId: string,
    connectorId: string
  ) => Promise<void>;
  onStartSession: (
    reservationId: string,
    meterReadingStartWh?: number
  ) => Promise<void>;
  onEndSession: (
    sessionId: string,
    payload: {
      meterReadingEndWh?: number;
      partnerEnergyKwh?: number;
      flagDispute?: boolean;
      disputeReason?: string;
    }
  ) => Promise<void>;
  onSubmitReview: (payload: {
    chargingPointId: string;
    rating: number;
    comment: string;
  }) => Promise<void>;
  onExploreMap: () => void;
  onOpenDriverRegistration?: () => void;
}

function formatCountdown(expiresAtIso: string, nowMs: number): string {
  const diffSec = Math.max(
    0,
    Math.floor((Date.parse(expiresAtIso) - nowMs) / 1000)
  );
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function QrVisual({ token }: { token: string }) {
  // Deterministic crisp 5x5 matrix SVG from token characters
  const cells: boolean[] = [];
  for (let i = 0; i < 25; i++) {
    const ch = token.charCodeAt(i % token.length) || 65;
    cells.push(((ch + i * 7) % 3) !== 0);
  }
  return (
    <svg
      viewBox="0 0 60 60"
      className="h-20 w-20 shrink-0 rounded-lg border border-zinc-200 bg-white p-1.5"
      aria-label={`QR verification code ${token}`}
    >
      {cells.map((filled, idx) => {
        const x = (idx % 5) * 10 + 5;
        const y = Math.floor(idx / 5) * 10 + 5;
        return (
          <rect
            key={idx}
            x={x}
            y={y}
            width="8"
            height="8"
            rx="1"
            fill={filled ? '#0f172a' : '#f1f5f9'}
          />
        );
      })}
    </svg>
  );
}

export function DriverTripsView({
  driver,
  chargingPoints,
  reservations,
  sessions,
  payments,
  liveTelemetry,
  onAddVehicle,
  onConfirmReservation,
  onCancelReservation,
  onReportBlockedBay,
  onReserveBackup,
  onStartSession,
  onEndSession,
  onSubmitReview,
  onExploreMap,
  onOpenDriverRegistration,
}: DriverTripsViewProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [garageViewMode, setGarageViewMode] = useState<'3d' | 'grid'>('3d');
  const [selectedStudioVehicleId, setSelectedStudioVehicleId] = useState<string>(
    driver.vehicles[0]?.id ?? ''
  );
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehMake, setVehMake] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehYear, setVehYear] = useState('2025');
  const [vehPlate, setVehPlate] = useState('');
  const [vehBattery, setVehBattery] = useState('78');
  const [vehConnectors, setVehConnectors] = useState<ConnectorType[]>([
    'Type2',
    'CCS',
  ]);
  const [vehError, setVehError] = useState<string | null>(null);

  const [qrInputs, setQrInputs] = useState<Record<string, string>>({});
  const [startMeterInputs, setStartMeterInputs] = useState<
    Record<string, string>
  >({});
  const [endMeterInputs, setEndMeterInputs] = useState<Record<string, string>>(
    {}
  );
  const [partnerKwhInputs, setPartnerKwhInputs] = useState<
    Record<string, string>
  >({});
  const [flagDisputeInputs, setFlagDisputeInputs] = useState<
    Record<string, boolean>
  >({});
  const [reviewForms, setReviewForms] = useState<
    Record<string, { rating: number; comment: string; submitted?: boolean }>
  >({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mapModalResId, setMapModalResId] = useState<string | null>(null);
  const [modalPreviewMode, setModalPreviewMode] = useState<'3d' | '2d'>('3d');
  const [tripSearchQuery, setTripSearchQuery] = useState('');
  const [blockedRecovery, setBlockedRecovery] = useState<{
    blockedPointName: string;
    backupSuggestion: BackupConnectorSuggestion | null;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mapModalResId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMapModalResId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mapModalResId]);

  const driverReservations = useMemo(
    () => reservations.filter((r) => r.driverId === driver.uid),
    [reservations, driver.uid]
  );

  const filteredDriverReservations = useMemo(() => {
    const q = tripSearchQuery.trim().toLowerCase();
    if (!q) return driverReservations;
    return driverReservations.filter((r) => {
      const point = chargingPoints.find((cp) => cp.id === r.chargingPointId);
      const nameMatch = r.chargingPointName.toLowerCase().includes(q);
      const addressMatch = (point?.address || '').toLowerCase().includes(q);
      return nameMatch || addressMatch;
    });
  }, [driverReservations, chargingPoints, tripSearchQuery]);

  const activeReservations = filteredDriverReservations.filter(
    (r) =>
      r.status === 'reserved' ||
      r.status === 'confirmed' ||
      r.status === 'charging'
  );
  const pastReservations = filteredDriverReservations.filter(
    (r) =>
      r.status === 'completed' ||
      r.status === 'disputed' ||
      r.status === 'cancelled'
  );

  function toggleVehicleConnector(conn: ConnectorType) {
    setVehConnectors((prev) =>
      prev.includes(conn) ? prev.filter((c) => c !== conn) : [...prev, conn]
    );
  }

  async function handleVehicleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setVehError(null);
    if (
      !vehMake.trim() ||
      !vehModel.trim() ||
      !vehPlate.trim() ||
      vehConnectors.length === 0
    ) {
      setVehError(
        'Please complete make, model, license plate, and at least one connector.'
      );
      return;
    }
    try {
      await onAddVehicle({
        make: vehMake.trim(),
        model: vehModel.trim(),
        year: Number(vehYear) || 2025,
        licensePlate: vehPlate.trim().toUpperCase(),
        batteryCapacity: Number(vehBattery) || 75,
        connectorType: vehConnectors,
      });
      setVehMake('');
      setVehModel('');
      setVehPlate('');
      setShowAddVehicle(false);
    } catch (err) {
      setVehError((err as Error).message);
    }
  }

  async function runAction(id: string, fn: () => Promise<void>) {
    setActionError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Driver Profile & Vehicle Garage */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Driver Account & Vehicle Garage
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {driver.name} · {driver.email} · {driver.paymentMethodLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Garage view mode"
              className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1"
            >
              <button
                type="button"
                onClick={() => setGarageViewMode('3d')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 ${
                  garageViewMode === '3d'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Box className="h-3.5 w-3.5 text-emerald-600" />
                <span className="hidden sm:inline">3D Virtual Studio</span>
                <span className="sm:hidden">3D Studio</span>
              </button>
              <button
                type="button"
                onClick={() => setGarageViewMode('grid')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 ${
                  garageViewMode === 'grid'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Car className="h-3.5 w-3.5" />
                <span>Cards ({driver.vehicles.length})</span>
              </button>
            </div>

            {onOpenDriverRegistration && (
              <button
                type="button"
                onClick={onOpenDriverRegistration}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Register Driver</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAddVehicle((v) => !v)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {showAddVehicle ? 'Close' : 'Add Vehicle'}
            </button>
          </div>
        </div>

        {showAddVehicle && (
          <form
            onSubmit={handleVehicleSubmit}
            className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <div>
                <label
                  htmlFor="veh-make"
                  className="block text-xs font-medium text-zinc-700"
                >
                  Make
                </label>
                <input
                  id="veh-make"
                  type="text"
                  value={vehMake}
                  onChange={(e) => setVehMake(e.target.value)}
                  placeholder="Hyundai"
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900"
                />
              </div>
              <div>
                <label
                  htmlFor="veh-model"
                  className="block text-xs font-medium text-zinc-700"
                >
                  Model
                </label>
                <input
                  id="veh-model"
                  type="text"
                  value={vehModel}
                  onChange={(e) => setVehModel(e.target.value)}
                  placeholder="Ioniq 5"
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900"
                />
              </div>
              <div>
                <label
                  htmlFor="veh-year"
                  className="block text-xs font-medium text-zinc-700"
                >
                  Year
                </label>
                <input
                  id="veh-year"
                  type="number"
                  value={vehYear}
                  onChange={(e) => setVehYear(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900"
                />
              </div>
              <div>
                <label
                  htmlFor="veh-plate"
                  className="block text-xs font-medium text-zinc-700"
                >
                  License Plate
                </label>
                <input
                  id="veh-plate"
                  type="text"
                  value={vehPlate}
                  onChange={(e) => setVehPlate(e.target.value)}
                  placeholder="M-IQ 501E"
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900"
                />
              </div>
              <div>
                <label
                  htmlFor="veh-battery"
                  className="block text-xs font-medium text-zinc-700"
                >
                  Battery (kWh)
                </label>
                <input
                  id="veh-battery"
                  type="number"
                  value={vehBattery}
                  onChange={(e) => setVehBattery(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-medium text-zinc-700">Connectors:</span>
                {(['Type2', 'CCS', 'Type1', 'CHAdeMO'] as ConnectorType[]).map(
                  (conn) => (
                    <label
                      key={conn}
                      className="flex cursor-pointer items-center gap-1.5 text-zinc-700"
                    >
                      <input
                        type="checkbox"
                        checked={vehConnectors.includes(conn)}
                        onChange={() => toggleVehicleConnector(conn)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span>{conn}</span>
                    </label>
                  )
                )}
              </div>

              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Save Vehicle
              </button>
            </div>
            {vehError && (
              <p className="text-xs font-medium text-red-700">{vehError}</p>
            )}
          </form>
        )}

        {garageViewMode === '3d' && driver.vehicles.length > 0 ? (
          <div className="mt-4">
            <VehicleShowroom3D
              vehicles={driver.vehicles}
              selectedVehicleId={selectedStudioVehicleId}
              onSelectVehicle={(id) => setSelectedStudioVehicleId(id)}
              heightClassName="h-[300px] sm:h-[400px]"
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {driver.vehicles.map((v, idx) => (
              <div
                key={v.id}
                className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 transition-all hover:border-zinc-300"
              >
                <Car className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-900">
                      {v.make} {v.model}
                    </span>
                    {idx === 0 && (
                      <span className="text-[11px] font-medium text-emerald-700">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-500 tabular-nums">
                    {v.licensePlate} · {v.year} · {v.batteryCapacity} kWh
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Connectors: {v.connectorType.join(' / ')}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudioVehicleId(v.id);
                      setGarageViewMode('3d');
                    }}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    <Box className="h-3 w-3" />
                    <span>Inspect 3D Digital Twin</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-900"
        >
          {actionError}
        </div>
      )}

      {/* Reservations Location Search Bar */}
      <section
        aria-label="Filter reservations"
        className="rounded-xl border border-zinc-200 bg-white p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <label htmlFor="trips-location-search" className="sr-only">
              Filter reservations by location name
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -tranzinc-y-1/2 text-zinc-400" />
            <input
              id="trips-location-search"
              type="text"
              value={tripSearchQuery}
              onChange={(e) => setTripSearchQuery(e.target.value)}
              placeholder="Filter past and upcoming reservations by location name..."
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 sm:justify-end">
            <span className="font-mono tabular-nums">
              {activeReservations.length} upcoming · {pastReservations.length}{' '}
              past
            </span>
            {tripSearchQuery.trim() !== '' && (
              <button
                type="button"
                onClick={() => setTripSearchQuery('')}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Active Reservations & Live Charging Sessions */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-zinc-900">
              Active Holds & Live Sessions
            </h2>
            <span className="font-mono text-xs tabular-nums text-zinc-500">
              {activeReservations.length} active
            </span>
          </div>

          {activeReservations.length > 0 && (
            <button
              type="button"
              onClick={() => setMapModalResId(activeReservations[0].id)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
            >
              <Map className="h-3.5 w-3.5 text-emerald-600" />
              Visual Map Summary
            </button>
          )}
        </div>

        {blockedRecovery && (
          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-5"
          >
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                  <span>
                    Hold Cancelled (No Penalty) · {blockedRecovery.blockedPointName} flagged Occupied (Walk-In)
                  </span>
                </div>
                {blockedRecovery.backupSuggestion ? (
                  <div className="space-y-1 text-xs text-zinc-700">
                    <div>
                      Nearest compatible backup within 5 km:{' '}
                      <span className="font-semibold text-zinc-900">
                        {blockedRecovery.backupSuggestion.point.name}
                      </span>{' '}
                      ({blockedRecovery.backupSuggestion.point.address})
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-zinc-700">
                      <span>
                        {blockedRecovery.backupSuggestion.distanceKm.toFixed(2)} km
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {blockedRecovery.backupSuggestion.etaMinutes} min ETA
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {blockedRecovery.backupSuggestion.connector.type} (
                        {blockedRecovery.backupSuggestion.connector.powerKw} kW)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-emerald-700">
                        ₹
                        {blockedRecovery.backupSuggestion.point.pricePerKwh.toFixed(
                          2
                        )}
                        /kWh
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-700">
                    No other compatible chargers are currently free within 5 km. Open the map to check partner hubs outside your immediate radius.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {blockedRecovery.backupSuggestion ? (
                  <button
                    type="button"
                    disabled={busyId === 'backup-reserve'}
                    onClick={() => {
                      const suggestion = blockedRecovery.backupSuggestion;
                      if (!suggestion) return;
                      runAction('backup-reserve', async () => {
                        await onReserveBackup(
                          suggestion.point.id,
                          suggestion.connector.id
                        );
                        setBlockedRecovery(null);
                      });
                    }}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Reserve Backup (30m Hold)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onExploreMap}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    Explore Map
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBlockedRecovery(null)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {activeReservations.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-zinc-900">
              {tripSearchQuery.trim()
                ? `No upcoming reservations match "${tripSearchQuery.trim()}"`
                : 'No active reservations or charging holds'}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {tripSearchQuery.trim()
                ? 'Clear the location filter to view all active holds.'
                : 'Reserve an available connector on the map to start a 30-minute hold.'}
            </p>
            {tripSearchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setTripSearchQuery('')}
                className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Clear Search
              </button>
            ) : (
              <button
                type="button"
                onClick={onExploreMap}
                className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Find Nearby Chargers
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {activeReservations.map((res) => {
              const session = sessions.find((s) => s.reservationId === res.id);
              const telemetry = session ? liveTelemetry[session.id] : undefined;
              const qrVal = qrInputs[res.id] ?? '';
              const startWhVal = startMeterInputs[res.id] ?? '142580';
              const realisticDeltaWh = Math.round(res.powerKw * 0.45 * 1000);
              const defaultEndWh =
                telemetry &&
                session?.meterReadingStartWh !== undefined &&
                telemetry.currentMeterWh > session.meterReadingStartWh
                  ? String(telemetry.currentMeterWh)
                  : session?.meterReadingStartWh !== undefined
                    ? String(session.meterReadingStartWh + realisticDeltaWh)
                    : String(142580 + realisticDeltaWh);
              const endWhVal = endMeterInputs[res.id] ?? defaultEndWh;
              const partnerKwhVal =
                partnerKwhInputs[res.id] ??
                (telemetry && telemetry.deliveredKwh > 0
                  ? telemetry.deliveredKwh.toFixed(2)
                  : '32.5');
              const isPrivate = res.chargingPointType === 'private_host';

              let previewBilling = null;
              if (
                isPrivate &&
                session?.meterReadingStartWh !== undefined &&
                Number(endWhVal) >= session.meterReadingStartWh
              ) {
                previewBilling = calculateMeteredBilling(
                  session.meterReadingStartWh,
                  Number(endWhVal),
                  res.pricePerKwh,
                  0.2
                );
              }

              return (
                <article
                  key={res.id}
                  className="rounded-xl border border-zinc-200 bg-white p-6"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-4 md:flex-row md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-700">
                          {res.id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isPrivate
                            ? 'Private Host (Metered 80/20)'
                            : 'Partner Station (15% Commission)'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {res.connectorType} ({res.powerKw} kW)
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          ₹{res.pricePerKwh.toFixed(2)}/kWh
                        </span>
                      </div>
                      <h3 className="mt-1 text-base font-bold text-zinc-900">
                        {res.chargingPointName}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setMapModalResId(res.id)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                        Map Summary
                      </button>
                      <span
                        className={`font-semibold ${
                          res.status === 'reserved'
                            ? 'text-amber-700'
                            : res.status === 'confirmed'
                              ? 'text-sky-700'
                              : 'text-emerald-700'
                        }`}
                      >
                        {res.status === 'reserved'
                          ? 'Reserved · 30m Hold'
                          : res.status === 'confirmed'
                            ? 'Arrival Confirmed'
                            : 'Charging In Progress'}
                      </span>
                      {res.status === 'reserved' && (
                        <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-zinc-900">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          {formatCountdown(res.expiresAt, nowMs)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Step 1: Reserved -> QR Verification */}
                  {res.status === 'reserved' && (
                    <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <QrVisual token={res.qrCodeToken} />
                        <div className="space-y-1 text-xs">
                          <div className="font-semibold text-zinc-900">
                            Arrival QR Verification Token
                          </div>
                          <div className="font-mono text-sm font-bold text-zinc-900">
                            {res.qrCodeToken}
                          </div>
                          <p className="text-zinc-500">
                            Scan at charger or enter token / connector ID (
                            <span className="font-mono">{res.connectorId}</span>
                            ) within 30 minutes.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={qrVal}
                          onChange={(e) =>
                            setQrInputs((p) => ({
                              ...p,
                              [res.id]: e.target.value,
                            }))
                          }
                          placeholder={`Enter ${res.qrCodeToken}`}
                          aria-label={`QR verification code for ${res.chargingPointName}`}
                          className="w-44 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setQrInputs((p) => ({
                              ...p,
                              [res.id]: res.qrCodeToken,
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Scan QR
                        </button>
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() =>
                            runAction(res.id, () =>
                              onConfirmReservation(res.id, qrVal)
                            )
                          }
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Confirm Arrival
                        </button>
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() =>
                            runAction(res.id, async () => {
                              const suggestion = await onReportBlockedBay(res.id);
                              setBlockedRecovery({
                                blockedPointName: res.chargingPointName,
                                backupSuggestion: suggestion,
                              });
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                          Bay Blocked
                        </button>
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() =>
                            runAction(res.id, () => onCancelReservation(res.id))
                          }
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          Cancel Hold
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Confirmed -> Start Charging */}
                  {res.status === 'confirmed' && (
                    <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                      <div className="space-y-1 text-xs">
                        <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-900">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          Arrival Verified · Plug In Vehicle
                        </div>
                        <p className="text-zinc-500">
                          {isPrivate
                            ? 'Capture the initial smart meter reading (Wh) before initiating power flow.'
                            : 'Partner OCPP gateway is ready to authorize DC power delivery.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-end gap-2">
                        {isPrivate && (
                          <div>
                            <label
                              htmlFor={`start-wh-${res.id}`}
                              className="block text-[11px] font-medium text-zinc-600"
                            >
                              Start Meter Reading (Wh)
                            </label>
                            <input
                              id={`start-wh-${res.id}`}
                              type="number"
                              value={startWhVal}
                              onChange={(e) =>
                                setStartMeterInputs((p) => ({
                                  ...p,
                                  [res.id]: e.target.value,
                                }))
                              }
                              className="mt-1 w-36 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs tabular-nums text-zinc-900"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() =>
                            runAction(res.id, () =>
                              onStartSession(
                                res.id,
                                isPrivate ? Number(startWhVal) : undefined
                              )
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Start Charging Session
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Charging -> End Session & Meter / Payment Settlement */}
                  {res.status === 'charging' && session && (
                    <div className="mt-5 space-y-4">
                      {telemetry && (
                        <div
                          data-testid={`live-telemetry-${session.id}`}
                          className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-2.5">
                            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                              <Activity className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Live Charging Telemetry</span>
                            </div>
                            <span className="font-mono text-[11px] text-zinc-600 tabular-nums">
                              {telemetry.protocol} · Elapsed{' '}
                              {formatElapsed(telemetry.elapsedSeconds)}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <div>
                              <div className="text-[11px] text-zinc-500">
                                Live Power
                              </div>
                              <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-zinc-900">
                                {telemetry.livePowerKw.toFixed(1)} kW
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] text-zinc-500">
                                Delivered Energy
                              </div>
                              <div
                                data-testid={`live-kwh-${session.id}`}
                                className="mt-0.5 font-mono text-base font-bold tabular-nums text-emerald-700"
                              >
                                {telemetry.deliveredKwh.toFixed(2)} kWh
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] text-zinc-500">
                                {isPrivate ? 'Live Meter Readout' : 'Meter Pulse'}
                              </div>
                              <div
                                data-testid={`live-wh-${session.id}`}
                                className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-900"
                              >
                                {isPrivate
                                  ? `${telemetry.currentMeterWh.toLocaleString()} Wh`
                                  : `${Math.round(telemetry.deliveredKwh * 1000).toLocaleString()} Wh`}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] text-zinc-500">
                                Running Cost
                              </div>
                              <div
                                data-testid={`live-cost-${session.id}`}
                                className="mt-0.5 font-mono text-base font-bold tabular-nums text-zinc-900"
                              >
                                ₹{telemetry.estimatedCostInr.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-3">
                        <div>
                          <div className="text-xs text-zinc-500">
                            Session Started
                          </div>
                          <div className="mt-0.5 font-mono text-xs font-medium text-zinc-900">
                            {new Date(session.startTime).toLocaleTimeString()}
                          </div>
                        </div>
                        {isPrivate ? (
                          <div>
                            <div className="text-xs text-zinc-500">
                              Start Meter Reading
                            </div>
                            <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-900">
                              {session.meterReadingStartWh?.toLocaleString()} Wh
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-xs text-zinc-500">
                              Partner Protocol
                            </div>
                            <div className="mt-0.5 font-mono text-xs font-medium text-zinc-900">
                              OCPI 2.2 Live Telemetry
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-zinc-500">
                            Billing Model
                          </div>
                          <div className="mt-0.5 text-xs font-medium text-zinc-900">
                            {isPrivate
                              ? 'Metered · 80% Host / 20% ImCharge'
                              : 'Partner Direct · 15% Commission'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                        <div className="flex flex-wrap items-end gap-3">
                          {isPrivate ? (
                            <>
                              <div>
                                <label
                                  htmlFor={`end-wh-${session.id}`}
                                  className="block text-xs font-medium text-zinc-700"
                                >
                                  End Meter Reading (Wh)
                                </label>
                                <input
                                  id={`end-wh-${session.id}`}
                                  type="number"
                                  value={endWhVal}
                                  onChange={(e) =>
                                    setEndMeterInputs((p) => ({
                                      ...p,
                                      [res.id]: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs tabular-nums text-zinc-900"
                                />
                              </div>
                              <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs text-zinc-600">
                                <input
                                  type="checkbox"
                                  checked={Boolean(flagDisputeInputs[res.id])}
                                  onChange={(e) =>
                                    setFlagDisputeInputs((p) => ({
                                      ...p,
                                      [res.id]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 accent-amber-600"
                                />
                                <span>Flag meter mismatch</span>
                              </label>
                            </>
                          ) : (
                            <div>
                              <label
                                htmlFor={`partner-kwh-${session.id}`}
                                className="block text-xs font-medium text-zinc-700"
                              >
                                Partner Delivered Energy (kWh)
                              </label>
                              <input
                                id={`partner-kwh-${session.id}`}
                                type="number"
                                step="0.1"
                                value={partnerKwhVal}
                                onChange={(e) =>
                                  setPartnerKwhInputs((p) => ({
                                    ...p,
                                    [res.id]: e.target.value,
                                  }))
                                }
                                className="mt-1 w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs tabular-nums text-zinc-900"
                              />
                            </div>
                          )}
                        </div>

                        {previewBilling && (
                          <div className="text-xs text-zinc-600 font-mono tabular-nums">
                            Delta: {previewBilling.energyDeliveredKwh.toFixed(2)}{' '}
                            kWh · Total ₹{previewBilling.grossAmount.toFixed(2)}{' '}
                            (Host ₹{previewBilling.hostPayout.toFixed(2)})
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={busyId === session.id}
                          onClick={() =>
                            runAction(session.id, () =>
                              onEndSession(
                                session.id,
                                isPrivate
                                  ? {
                                      meterReadingEndWh: Number(endWhVal),
                                      flagDispute: Boolean(
                                        flagDisputeInputs[res.id]
                                      ),
                                    }
                                  : {
                                      partnerEnergyKwh: Number(partnerKwhVal),
                                    }
                              )
                            )
                          }
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          End Charging & Pay
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Session History, Receipts & Reviews */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-zinc-900">
          Completed Trips & Receipts
        </h2>

        <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {pastReservations.length === 0 ? (
            <div className="p-6 text-xs text-zinc-500">
              {tripSearchQuery.trim()
                ? `No past reservations match "${tripSearchQuery.trim()}".`
                : 'No completed trips yet.'}
            </div>
          ) : (
            pastReservations.map((res) => {
              const session = sessions.find((s) => s.reservationId === res.id);
              const chargePayment = session
                ? payments.find(
                    (p) => p.sessionId === session.id && p.type === 'charge'
                  )
                : undefined;
              const formState = reviewForms[res.id] ?? {
                rating: 5,
                comment: '',
                submitted: false,
              };

              return (
                <div key={res.id} className="space-y-3 p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono">{res.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{res.connectorType}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            res.status === 'completed'
                              ? 'font-medium text-emerald-700'
                              : res.status === 'disputed'
                                ? 'font-medium text-red-700'
                                : 'font-medium text-zinc-500'
                          }
                        >
                          {res.status.charAt(0).toUpperCase() +
                            res.status.slice(1)}
                        </span>
                      </div>
                      <h3 className="mt-0.5 text-sm font-semibold text-zinc-900">
                        {res.chargingPointName}
                      </h3>
                    </div>

                    {session && (
                      <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
                        <span className="text-zinc-600">
                          {session.energyDeliveredKwh.toFixed(2)} kWh
                        </span>
                        <span className="font-semibold text-zinc-900">
                          ₹{session.amount.toFixed(2)}
                        </span>
                        {chargePayment && (
                          <span className="text-zinc-500">
                            {chargePayment.stripeTransactionId}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {res.status === 'cancelled' && res.notes && (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      {res.notes}
                    </div>
                  )}

                  {session?.status === 'disputed' && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <div>
                        <span className="font-semibold">Dispute Open: </span>
                        {session.disputeReason}
                      </div>
                    </div>
                  )}

                  {res.status === 'completed' && !formState.submitted && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!formState.comment.trim()) return;
                        runAction(res.id, async () => {
                          await onSubmitReview({
                            chargingPointId: res.chargingPointId,
                            rating: formState.rating,
                            comment: formState.comment,
                          });
                          setReviewForms((p) => ({
                            ...p,
                            [res.id]: { ...formState, submitted: true },
                          }));
                        });
                      }}
                      className="flex flex-wrap items-center gap-2 pt-1"
                    >
                      <label
                        htmlFor={`rate-${res.id}`}
                        className="text-xs font-medium text-zinc-600"
                      >
                        Rate host:
                      </label>
                      <select
                        id={`rate-${res.id}`}
                        value={formState.rating}
                        onChange={(e) =>
                          setReviewForms((p) => ({
                            ...p,
                            [res.id]: {
                              ...formState,
                              rating: Number(e.target.value),
                            },
                          }))
                        }
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800"
                      >
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} Stars
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={formState.comment}
                        onChange={(e) =>
                          setReviewForms((p) => ({
                            ...p,
                            [res.id]: { ...formState, comment: e.target.value },
                          }))
                        }
                        placeholder="Share feedback on parking access or meter accuracy..."
                        aria-label={`Review comment for ${res.chargingPointName}`}
                        className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900"
                      />
                      <button
                        type="submit"
                        disabled={!formState.comment.trim() || busyId === res.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        <Star className="h-3 w-3 text-amber-500" />
                        Post Review
                      </button>
                    </form>
                  )}

                  {formState.submitted && (
                    <p className="text-xs font-medium text-emerald-700">
                      Review published to {res.chargingPointName}.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Visual Map Summary Modal */}
      {mapModalResId && (() => {
        const modalRes =
          driverReservations.find((r) => r.id === mapModalResId) ??
          activeReservations[0] ??
          null;
        if (!modalRes) return null;
        const modalPoint = chargingPoints.find(
          (cp) => cp.id === modalRes.chargingPointId
        );
        const etaMin = estimateEtaMinutes(modalRes.distanceKm);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
            onClick={() => setMapModalResId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="map-summary-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3 sm:px-5 sm:py-4">
                <div>
                  <div className="text-xs font-medium text-emerald-700">
                    Reservation Location & 3D Bay Summary
                  </div>
                  <h3
                    id="map-summary-title"
                    className="mt-0.5 text-base font-bold text-zinc-900"
                  >
                    {modalRes.chargingPointName}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {modalPoint?.address || 'Munich Metro Charging Bay'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {modalPoint && (
                    <div
                      role="group"
                      aria-label="Modal preview mode"
                      className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => setModalPreviewMode('3d')}
                        aria-pressed={modalPreviewMode === '3d'}
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${
                          modalPreviewMode === '3d'
                            ? 'bg-white text-zinc-900 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        <Box className="h-3 w-3 text-emerald-600" />
                        3D Twin
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalPreviewMode('2d')}
                        aria-pressed={modalPreviewMode === '2d'}
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${
                          modalPreviewMode === '2d'
                            ? 'bg-white text-zinc-900 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        <Map className="h-3 w-3" />
                        2D Route
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setMapModalResId(null)}
                    aria-label="Close map summary modal"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {modalPoint && modalPreviewMode === '3d' ? (
                <ChargerBay3D
                  point={modalPoint}
                  initialPowerFlow={modalRes.status === 'charging'}
                  heightClassName="h-64"
                />
              ) : (
              /* 2D Route Summary Map */
              <div className="relative h-56 w-full bg-[#eef2f6]">
                <svg
                  viewBox="0 0 480 220"
                  className="h-full w-full"
                  role="img"
                  aria-label={`Location preview placeholder for ${modalRes.chargingPointName}`}
                >
                  <defs>
                    <pattern
                      id="modalGrid"
                      width="32"
                      height="32"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 32 0 L 0 0 0 32"
                        fill="none"
                        stroke="#dce4ee"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="480" height="220" fill="url(#modalGrid)" />

                  {/* Stylized roads & river */}
                  <path
                    d="M 210 230 C 235 150, 265 95, 315 -10"
                    fill="none"
                    stroke="#bdd6ec"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  <line
                    x1="30"
                    y1="150"
                    x2="450"
                    y2="75"
                    stroke="#ffffff"
                    strokeWidth="5"
                  />
                  <line
                    x1="150"
                    y1="20"
                    x2="260"
                    y2="205"
                    stroke="#ffffff"
                    strokeWidth="4"
                  />

                  {/* Proximity ring around destination */}
                  <circle
                    cx="320"
                    cy="86"
                    r="52"
                    fill="#059669"
                    fillOpacity="0.08"
                    stroke="#059669"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                  />

                  {/* Route path from driver pin to charger */}
                  <path
                    d="M 135 152 Q 225 130 320 86"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="2.5"
                    strokeDasharray="6 5"
                  />

                  {/* Driver origin marker */}
                  <circle cx="135" cy="152" r="10" fill="#0f172a" fillOpacity="0.14" />
                  <circle
                    cx="135"
                    cy="152"
                    r="5.5"
                    fill="#0f172a"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x="112"
                    y="174"
                    fill="#475569"
                    fontSize="10"
                    fontWeight="600"
                  >
                    Your Vehicle
                  </text>

                  {/* Charger destination pin */}
                  <circle cx="320" cy="86" r="15" fill="#059669" fillOpacity="0.18" />
                  <circle
                    cx="320"
                    cy="86"
                    r="8"
                    fill="#059669"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                </svg>

                {/* Destination floating card */}
                <div className="absolute right-3 top-3 rounded-lg border border-zinc-200 bg-white/95 px-3 py-1.5 text-xs shadow-xs">
                  <div className="font-mono font-semibold tabular-nums text-emerald-700">
                    ₹{modalRes.pricePerKwh.toFixed(2)}/kWh
                  </div>
                  <div className="font-mono text-[11px] text-zinc-600 tabular-nums">
                    {modalRes.connectorType} · {modalRes.powerKw} kW
                  </div>
                </div>

                {/* Bottom route telemetry strip */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900">
                    <Navigation className="h-3.5 w-3.5 text-emerald-600" />
                    {modalRes.distanceKm} km away · ~{etaMin} min drive
                  </span>
                  {modalPoint && (
                    <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                      {modalPoint.location.lat.toFixed(4)}°N,{' '}
                      {modalPoint.location.lon.toFixed(4)}°E
                    </span>
                  )}
                </div>
              </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3.5">
                <span className="font-mono text-xs text-zinc-600">
                  Hold Token: <strong className="text-zinc-900">{modalRes.qrCodeToken}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMapModalResId(null);
                      onExploreMap();
                    }}
                    className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Open Full Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapModalResId(null)}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
