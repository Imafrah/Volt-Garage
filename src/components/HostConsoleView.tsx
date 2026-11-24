import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Home,
  IndianRupee,
  Pause,
  Play,
  QrCode,
  Radio,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  calculateMeteredBilling,
  summarizeHostPayouts,
} from '../domain/imchargeEngine';
import type {
  ChargingPoint,
  ChargingSession,
  ConnectorType,
  HostProfile,
  LiveTelemetryReading,
  OcppTelemetryPayload,
  PaymentRecord,
  Reservation,
  TelemetryEventRecord,
} from '../domain/types';
import { SmartMeter3D } from './SmartMeter3D';

export type HostSubTab = 'queue' | 'payouts' | 'onboard';

interface HostConsoleViewProps {
  hosts: HostProfile[];
  chargingPoints: ChargingPoint[];
  reservations: Reservation[];
  sessions: ChargingSession[];
  payments: PaymentRecord[];
  liveTelemetry: Record<string, LiveTelemetryReading>;
  telemetryEvents: TelemetryEventRecord[];
  telemetryHeartbeatEnabled: boolean;
  initialTab?: HostSubTab;
  activeHostId?: string | null;
  onOpenHostRegistration?: () => void;
  onCreateChargingPoint: (payload: {
    hostUid?: string;
    hostName: string;
    type: 'private_host' | 'existing_station';
    partnerName?: string;
    partnerStationId?: string;
    name: string;
    address: string;
    description: string;
    lat: number;
    lon: number;
    pricePerKwh: number;
    connectorType: ConnectorType;
    powerKw: number;
    meterSerialNumber?: string;
    availabilityHours: string;
  }) => Promise<void>;
  onConfirmReservation: (resId: string, qrToken: string) => Promise<void>;
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
    }
  ) => Promise<void>;
  onProcessPayouts: (hostId: string) => Promise<void>;
  onUpdateConnectorStatus: (
    pointId: string,
    connectorId: string,
    status: 'available' | 'occupied' | 'maintenance',
    reason?: string
  ) => Promise<string[]>;
  onSendOcppTelemetry: (payload: OcppTelemetryPayload) => Promise<{
    event: TelemetryEventRecord;
    cancelledReservationIds: string[];
  }>;
  onToggleHeartbeat: (enabled: boolean) => Promise<void>;
}

const DISTRICT_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  schwabing: { lat: 48.1635, lon: 11.5892, label: 'Schwabing (2.9 km)' },
  maxvorstadt: { lat: 48.1488, lon: 11.5642, label: 'Maxvorstadt (1.6 km)' },
  haidhausen: { lat: 48.1325, lon: 11.5992, label: 'Haidhausen (1.8 km)' },
  sendling: { lat: 48.1185, lon: 11.5481, label: 'Sendling (2.9 km)' },
  bogenhausen: { lat: 48.1492, lon: 11.6152, label: 'Bogenhausen (3.2 km)' },
};

export function HostConsoleView({
  hosts,
  chargingPoints,
  reservations,
  sessions,
  payments,
  liveTelemetry,
  telemetryEvents,
  telemetryHeartbeatEnabled,
  initialTab = 'queue',
  activeHostId = null,
  onOpenHostRegistration,
  onCreateChargingPoint,
  onConfirmReservation,
  onStartSession,
  onEndSession,
  onProcessPayouts,
  onUpdateConnectorStatus,
  onSendOcppTelemetry,
  onToggleHeartbeat,
}: HostConsoleViewProps) {
  const [subTab, setSubTab] = useState<HostSubTab>(initialTab);
  const [selectedHostFilter, setSelectedHostFilter] = useState<string>('all');

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  // Meter & QR state for Host queue
  const [qrInputs, setQrInputs] = useState<Record<string, string>>({});
  const [startWhInputs, setStartWhInputs] = useState<Record<string, string>>(
    {}
  );
  const [endWhInputs, setEndWhInputs] = useState<Record<string, string>>({});
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueSuccess, setQueueSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [connectorFeedback, setConnectorFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [connectorBusyKey, setConnectorBusyKey] = useState<string | null>(null);

  const [simTargetKey, setSimTargetKey] = useState<string>(() => {
    const firstCp = chargingPoints[0];
    const firstConn = firstCp?.connectors[0];
    return firstCp && firstConn ? `${firstCp.id}::${firstConn.id}` : '';
  });
  const [simLoadKw, setSimLoadKw] = useState<string>('7.4');
  const [simBusy, setSimBusy] = useState(false);
  const [simFeedback, setSimFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Onboarding form state
  const [selectedHostUid, setSelectedHostUid] = useState<string>(
    activeHostId || ''
  );
  const [hostType, setHostType] = useState<'private_host' | 'existing_station'>(
    'private_host'
  );
  const [hostName, setHostName] = useState('');
  const [pointName, setPointName] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('haidhausen');
  const [description, setDescription] = useState('');
  const [connectorType, setConnectorType] = useState<ConnectorType>('Type2');
  const [powerKw, setPowerKw] = useState('22');
  const [pricePerKwh, setPricePerKwh] = useState('18.00');
  const [meterSerialNumber, setMeterSerialNumber] = useState('SM-400-8831B');
  const [partnerName, setPartnerName] = useState('Ionity');
  const [partnerStationId, setPartnerStationId] = useState('ION-MUC-099');
  const [availabilityHours, setAvailabilityHours] = useState('07:00 – 22:00 daily');
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardSuccess, setOnboardSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!activeHostId) return;
    const matched = hosts.find((h) => h.uid === activeHostId);
    if (!matched) return;
    setSelectedHostUid(matched.uid);
    setHostName(matched.name);
    setHostType(matched.chargingPointType);
    if (matched.equipment) {
      setPowerKw(String(matched.equipment.powerKw));
      setMeterSerialNumber(matched.equipment.meterSerialNumber);
      if (matched.equipment.connectorType[0]) {
        setConnectorType(matched.equipment.connectorType[0]);
      }
    }
    if (matched.partnerNetwork) setPartnerName(matched.partnerNetwork);
    if (matched.partnerStationId) setPartnerStationId(matched.partnerStationId);
    setAvailabilityHours(matched.availability.weekdays);
  }, [activeHostId, hosts]);

  const filteredReservations = useMemo(() => {
    const active = reservations.filter(
      (r) =>
        r.status === 'reserved' ||
        r.status === 'confirmed' ||
        r.status === 'charging'
    );
    if (selectedHostFilter === 'all') return active;
    return active.filter((r) => r.hostId === selectedHostFilter);
  }, [reservations, selectedHostFilter]);

  const payoutSummaries = useMemo(() => {
    return hosts.map((host) => {
      const summary = summarizeHostPayouts(payments, host.uid);
      const hostPoints = chargingPoints.filter((cp) => cp.hostUid === host.uid);
      return {
        host,
        hostPoints,
        pendingInr: summary.pendingAmountInr,
        paidInr: summary.settledAmountInr,
      };
    });
  }, [hosts, payments, chargingPoints]);

  const estimatedPayoutSummary = useMemo(
    () => summarizeHostPayouts(payments, selectedHostFilter),
    [payments, selectedHostFilter]
  );

  const selectedHostLabel = useMemo(() => {
    if (selectedHostFilter === 'all') return `All Hosts (${hosts.length})`;
    return hosts.find((h) => h.uid === selectedHostFilter)?.name || 'Selected Host';
  }, [hosts, selectedHostFilter]);

  async function runQueueAction(id: string, msg: string, fn: () => Promise<void>) {
    setQueueError(null);
    setQueueSuccess(null);
    setBusyId(id);
    try {
      await fn();
      setQueueSuccess(msg);
    } catch (err) {
      setQueueError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleOnboardSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOnboardError(null);
    setOnboardSuccess(null);

    if (!hostName.trim() || !pointName.trim() || !address.trim()) {
      setOnboardError(
        'Host name, charging point title, and street address are required.'
      );
      return;
    }
    if (hostType === 'private_host' && !meterSerialNumber.trim()) {
      setOnboardError(
        'Private hosts must provide a certified meter serial number.'
      );
      return;
    }

    const coords = DISTRICT_COORDS[district] || DISTRICT_COORDS.haidhausen;
    setIsSubmitting(true);
    try {
      await onCreateChargingPoint({
        hostUid: selectedHostUid || undefined,
        hostName: hostName.trim(),
        type: hostType,
        partnerName: hostType === 'existing_station' ? partnerName : undefined,
        partnerStationId:
          hostType === 'existing_station' ? partnerStationId : undefined,
        name: pointName.trim(),
        address: address.trim(),
        description:
          description.trim() ||
          (hostType === 'private_host'
            ? 'Verified private host bay with digital kWh meter verification.'
            : `${partnerName} partner station synced via OCPI gateway.`),
        lat: coords.lat,
        lon: coords.lon,
        pricePerKwh: Number(pricePerKwh) || 18,
        connectorType,
        powerKw: Number(powerKw) || 22,
        meterSerialNumber:
          hostType === 'private_host' ? meterSerialNumber.trim() : undefined,
        availabilityHours: availabilityHours.trim() || '24/7',
      });
      setOnboardSuccess(
        `Published "${pointName.trim()}" to the live Munich charging marketplace.`
      );
      setPointName('');
      setAddress('');
      setDescription('');
    } catch (err) {
      setOnboardError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Host Workspace Toolbar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Host console sections"
          className="flex items-center gap-1 overflow-x-auto max-w-full rounded-lg bg-zinc-100 p-1 scrollbar-none"
        >
          {(
            [
              { id: 'queue', label: 'Bookings & Meter Queue', mobileLabel: 'Queue' },
              { id: 'payouts', label: 'Chargers & Payouts', mobileLabel: 'Payouts' },
              { id: 'onboard', label: 'Onboard Charger', mobileLabel: 'Onboard' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subTab === tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                subTab === tab.id
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span className="sm:hidden">{tab.mobileLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {(subTab === 'queue' || subTab === 'payouts') && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="host-filter" className="font-medium text-zinc-600">
              Host:
            </label>
            <select
              id="host-filter"
              value={selectedHostFilter}
              onChange={(e) => setSelectedHostFilter(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800"
            >
              <option value="all">All Hosts ({hosts.length})</option>
              {hosts.map((h) => (
                <option key={h.uid} value={h.uid}>
                  {h.name}
                </option>
              ))}
            </select>
            {onOpenHostRegistration && (
              <button
                type="button"
                onClick={onOpenHostRegistration}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                <span>+ Register Host</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pending Payouts Summary Card / Estimated Payout Widget */}
      <section
        aria-label="Pending Payouts Summary"
        className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
            <span>Pending Payouts</span>
          </div>
          <h2 className="text-base font-bold text-zinc-900">
            Earnings Awaiting Disbursement
          </h2>
          <p className="text-xs text-zinc-500">
            Scope: <span className="font-medium text-zinc-700">{selectedHostLabel}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">
              {estimatedPayoutSummary.pendingCount} pending transfer
              {estimatedPayoutSummary.pendingCount === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">
              Settled to date: ₹{estimatedPayoutSummary.settledAmountInr.toFixed(2)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 sm:justify-end">
          <div className="sm:text-right">
            <div className="text-xs font-medium text-zinc-500">
              Estimated Payout
            </div>
            <div
              data-testid="estimated-payout-amount"
              className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-emerald-700"
            >
              ₹{estimatedPayoutSummary.pendingAmountInr.toFixed(2)}
            </div>
          </div>

          {subTab !== 'payouts' && (
            <button
              type="button"
              onClick={() => setSubTab('payouts')}
              className="whitespace-nowrap shrink-0 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
            >
              Manage Payouts
            </button>
          )}
        </div>
      </section>

      {/* TAB 1: Bookings & Meter Verification Queue */}
      {subTab === 'queue' && (
        <div className="space-y-4">
          {queueError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-900"
            >
              {queueError}
            </div>
          )}
          {queueSuccess && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
            >
              {queueSuccess}
            </div>
          )}

          {filteredReservations.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
              <p className="text-sm font-medium text-zinc-900">
                No active driver arrivals in your host queue
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                When a driver reserves one of your connectors, QR verification and meter reading controls will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
              <div className="space-y-4 lg:col-span-8">
                {filteredReservations.map((res) => {
                  const session = sessions.find(
                    (s) => s.reservationId === res.id
                  );
                  const telemetry = session ? liveTelemetry[session.id] : undefined;
                  const isPrivate = res.chargingPointType === 'private_host';
                  const qrVal = qrInputs[res.id] ?? '';
                  const startWh = startWhInputs[res.id] ?? '142580';
                  const realisticDeltaWh = Math.round(res.powerKw * 0.45 * 1000);
                  const defaultEndWh =
                    telemetry &&
                    session?.meterReadingStartWh !== undefined &&
                    telemetry.currentMeterWh > session.meterReadingStartWh
                      ? String(telemetry.currentMeterWh)
                      : String(
                          (session?.meterReadingStartWh ?? 142580) + realisticDeltaWh
                        );
                  const endWh = endWhInputs[res.id] ?? defaultEndWh;

                  let preview = null;
                  if (
                    isPrivate &&
                    session?.meterReadingStartWh !== undefined &&
                    Number(endWh) >= session.meterReadingStartWh
                  ) {
                    preview = calculateMeteredBilling(
                      session.meterReadingStartWh,
                      Number(endWh),
                      res.pricePerKwh,
                      0.2
                    );
                  }

                  return (
                    <article
                      key={res.id}
                      className="rounded-xl border border-zinc-200 bg-white p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="font-mono">{res.id}</span>
                            <span aria-hidden="true">·</span>
                            <span>Driver: {res.driverName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              {res.connectorType} ({res.powerKw} kW)
                            </span>
                          </div>
                          <h3 className="mt-0.5 text-sm font-bold text-zinc-900">
                            {res.chargingPointName}
                          </h3>
                        </div>

                        <span className="font-mono text-xs font-semibold text-emerald-700">
                          Status: {res.status}
                        </span>
                      </div>

                      {res.status === 'reserved' && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-zinc-600">
                            Driver QR Token:{' '}
                            <span className="font-mono font-semibold text-zinc-900">
                              {res.qrCodeToken}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={qrVal}
                              onChange={(e) =>
                                setQrInputs((p) => ({
                                  ...p,
                                  [res.id]: e.target.value,
                                }))
                              }
                              placeholder={res.qrCodeToken}
                              aria-label={`Verify driver QR for ${res.id}`}
                              className="w-36 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setQrInputs((p) => ({
                                  ...p,
                                  [res.id]: res.qrCodeToken,
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              Match QR
                            </button>
                            <button
                              type="button"
                              disabled={busyId === res.id}
                              onClick={() =>
                                runQueueAction(
                                  res.id,
                                  'Driver arrival verified.',
                                  () => onConfirmReservation(res.id, qrVal)
                                )
                              }
                              className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Verify Arrival
                            </button>
                          </div>
                        </div>
                      )}

                      {res.status === 'confirmed' && (
                        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                          <div className="text-xs text-zinc-600">
                            {isPrivate
                              ? 'Capture smart meter start reading (Wh) as driver plugs in.'
                              : 'Ready to start partner station session.'}
                          </div>
                          <div className="flex items-end gap-2">
                            {isPrivate && (
                              <div>
                                <label
                                  htmlFor={`host-start-${res.id}`}
                                  className="block text-[11px] font-medium text-zinc-600"
                                >
                                  Start Meter (Wh)
                                </label>
                                <input
                                  id={`host-start-${res.id}`}
                                  type="number"
                                  value={startWh}
                                  onChange={(e) =>
                                    setStartWhInputs((p) => ({
                                      ...p,
                                      [res.id]: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-32 rounded-lg border border-zinc-200 px-2.5 py-1.5 font-mono text-xs"
                                />
                              </div>
                            )}
                            <button
                              type="button"
                              disabled={busyId === res.id}
                              onClick={() =>
                                runQueueAction(
                                  res.id,
                                  'Charging session started.',
                                  () =>
                                    onStartSession(
                                      res.id,
                                      isPrivate ? Number(startWh) : undefined
                                    )
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Zap className="h-3.5 w-3.5" />
                              Authorize & Start
                            </button>
                          </div>
                        </div>
                      )}

                      {res.status === 'charging' && session && (
                        <div className="mt-4 space-y-3">
                          {telemetry && (
                            <div className="grid grid-cols-2 gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-4">
                              <div>
                                <div className="text-[11px] text-zinc-500">
                                  Live Power
                                </div>
                                <div className="font-mono text-xs font-bold tabular-nums text-zinc-900">
                                  {telemetry.livePowerKw.toFixed(1)} kW
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-zinc-500">
                                  Delivered
                                </div>
                                <div className="font-mono text-xs font-bold tabular-nums text-emerald-700">
                                  {telemetry.deliveredKwh.toFixed(2)} kWh
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-zinc-500">
                                  Running Total
                                </div>
                                <div className="font-mono text-xs font-bold tabular-nums text-zinc-900">
                                  ₹{telemetry.estimatedCostInr.toFixed(2)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-zinc-500">
                                  Protocol
                                </div>
                                <div className="font-mono text-[11px] font-medium tabular-nums text-zinc-700">
                                  {telemetry.protocol} · {telemetry.elapsedSeconds}s
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-end justify-between gap-3">
                            {isPrivate ? (
                              <div className="flex flex-wrap items-end gap-3">
                                <div>
                                  <span className="block text-[11px] text-zinc-500">
                                    Start Reading
                                  </span>
                                  <span className="font-mono text-xs font-semibold tabular-nums text-zinc-900">
                                    {session.meterReadingStartWh?.toLocaleString()}{' '}
                                    Wh
                                  </span>
                                </div>
                                <div>
                                  <label
                                    htmlFor={`host-end-${session.id}`}
                                    className="block text-[11px] font-medium text-zinc-600"
                                  >
                                    End Reading (Wh)
                                  </label>
                                  <input
                                    id={`host-end-${session.id}`}
                                    type="number"
                                    value={endWh}
                                    onChange={(e) =>
                                      setEndWhInputs((p) => ({
                                        ...p,
                                        [res.id]: e.target.value,
                                      }))
                                    }
                                    className="mt-1 w-32 rounded-lg border border-zinc-200 px-2.5 py-1.5 font-mono text-xs"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-zinc-600">
                                Partner session in progress (15% commission)
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={busyId === session.id}
                              onClick={() =>
                                runQueueAction(
                                  session.id,
                                  'Session completed and payout queued.',
                                  () =>
                                    onEndSession(
                                      session.id,
                                      isPrivate
                                        ? { meterReadingEndWh: Number(endWh) }
                                        : {
                                            partnerEnergyKwh:
                                              telemetry &&
                                              telemetry.deliveredKwh > 0
                                                ? telemetry.deliveredKwh
                                                : 28.0,
                                          }
                                    )
                                )
                              }
                              className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                            >
                              Verify End Meter & Settle
                            </button>
                          </div>

                          {preview && (
                            <div className="border-t border-zinc-100 pt-2 font-mono text-xs tabular-nums text-zinc-600">
                              Calculated:{' '}
                              {preview.energyDeliveredKwh.toFixed(2)} kWh ·
                              Gross ₹{preview.grossAmount.toFixed(2)} · Your
                              80% Payout ₹{preview.hostPayout.toFixed(2)}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {/* Meter OCR Reference Card */}
              <aside className="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                  <Camera className="h-4 w-4 text-emerald-600" />
                  Smart Meter OCR Verification
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                  Private hosts capture start and end Wh readings. ImCharge
                  computes{' '}
                  <span className="font-mono text-zinc-900">
                    (end - start) / 1000
                  </span>{' '}
                  kWh and flags physical power-ceiling anomalies automatically.
                </p>
                <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                  <img
                    src="/src/assets/images/digital_smart_meter_1795443225372.jpg"
                    alt="Digital smart kWh meter showing 142580 Wh"
                    referrerPolicy="no-referrer"
                    className="aspect-4/3 w-full object-cover"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between font-mono text-xs text-zinc-700">
                  <span>Detected Readout:</span>
                  <span className="font-semibold text-emerald-700">
                    142580 Wh
                  </span>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: My Chargers & Payouts */}
      {subTab === 'payouts' && (
        <div className="space-y-4">
          <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {payoutSummaries.map(
              ({ host, hostPoints, pendingInr, paidInr }) => (
                <div
                  key={host.uid}
                  className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="font-semibold text-zinc-900">
                        {host.name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {host.chargingPointType === 'private_host'
                          ? 'Private Host (80% Payout)'
                          : `${host.partnerNetwork} Partner (15% Commission)`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        KYC {host.kycStatus}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-zinc-500">
                      IBAN: {host.bankAccountIban} · {hostPoints.length}{' '}
                      charging point(s)
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[11px] text-zinc-500">
                        Settled Payouts
                      </div>
                      <div className="text-sm font-semibold text-zinc-900">
                        ₹{paidInr.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[11px] text-zinc-500">
                        Pending Weekly
                      </div>
                      <div className="text-sm font-semibold text-emerald-700">
                        ₹{pendingInr.toFixed(2)}
                      </div>
                    </div>
                    {host.chargingPointType === 'private_host' && (
                      <button
                        type="button"
                        disabled={pendingInr <= 0}
                        onClick={() => onProcessPayouts(host.uid)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                        Process Payout
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Interactive 3D DIN-Rail Smart Meter Digital Twin */}
          <SmartMeter3D
            serialNumber="DE-MUC-SM-90214"
            activePowerKw={Number(simLoadKw) || 7.4}
            totalKwh={1482.6}
            payoutEur={estimatedPayoutSummary.settledAmountInr ? estimatedPayoutSummary.settledAmountInr * 0.011 : 184.5}
            isSessionActive={telemetryHeartbeatEnabled}
            heightClassName="h-[280px] sm:h-[360px]"
          />

          {/* OCPP & Smart Meter Telemetry Simulator */}
          <section
            aria-label="OCPP and smart meter telemetry simulator"
            className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <Radio className="h-3.5 w-3.5" />
                  <span>OCPP 2.0.1 / Smart Meter Telemetry</span>
                </div>
                <h3 className="mt-0.5 text-base font-bold text-zinc-900">
                  Hardware Heartbeat & Walk-In Load Simulator
                </h3>
                <p className="mt-0.5 text-xs text-zinc-600">
                  Stream live server meter ticks over SSE or trigger an OCPP webhook pulse. Any unbooked load above 0.5 kW auto-flags the bay occupied.
                </p>
              </div>

              <button
                type="button"
                disabled={simBusy}
                onClick={async () => {
                  setSimBusy(true);
                  setSimFeedback(null);
                  try {
                    await onToggleHeartbeat(!telemetryHeartbeatEnabled);
                    setSimFeedback({
                      type: 'success',
                      text: telemetryHeartbeatEnabled
                        ? 'Server telemetry heartbeat paused.'
                        : 'Server telemetry heartbeat resumed (2s SSE interval).',
                    });
                  } catch (err) {
                    setSimFeedback({
                      type: 'error',
                      text: (err as Error).message,
                    });
                  } finally {
                    setSimBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              >
                {telemetryHeartbeatEnabled ? (
                  <>
                    <Pause className="h-3.5 w-3.5 text-amber-600" />
                    Pause Heartbeat
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 text-emerald-600" />
                    Resume Heartbeat
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
              <div className="md:col-span-5">
                <label
                  htmlFor="sim-connector-select"
                  className="block text-xs font-medium text-zinc-700"
                >
                  Target Charging Connector
                </label>
                <select
                  id="sim-connector-select"
                  value={simTargetKey}
                  onChange={(e) => setSimTargetKey(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900"
                >
                  {chargingPoints.flatMap((cp) =>
                    cp.connectors.map((c) => (
                      <option key={`${cp.id}::${c.id}`} value={`${cp.id}::${c.id}`}>
                        {cp.name} — {c.id} ({c.type}, {c.powerKw} kW · {c.status})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="sim-load-kw"
                  className="block text-xs font-medium text-zinc-700"
                >
                  Load (kW)
                </label>
                <input
                  id="sim-load-kw"
                  type="number"
                  step="0.1"
                  min="0"
                  value={simLoadKw}
                  onChange={(e) => setSimLoadKw(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs tabular-nums text-zinc-900"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 md:col-span-5 md:justify-end">
                <button
                  type="button"
                  disabled={simBusy || !simTargetKey}
                  onClick={async () => {
                    const [chargingPointId, connectorId] = simTargetKey.split('::');
                    if (!chargingPointId || !connectorId) return;
                    setSimBusy(true);
                    setSimFeedback(null);
                    try {
                      const res = await onSendOcppTelemetry({
                        chargingPointId,
                        connectorId,
                        eventType: 'MeterValues',
                        powerKw: Number(simLoadKw) || 0,
                      });
                      setSimFeedback({
                        type: 'success',
                        text: res.event.summary,
                      });
                    } catch (err) {
                      setSimFeedback({
                        type: 'error',
                        text: (err as Error).message,
                      });
                    } finally {
                      setSimBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                >
                  <Activity className="h-3.5 w-3.5 text-emerald-600" />
                  Send OCPP Meter Pulse
                </button>
                <button
                  type="button"
                  disabled={simBusy || !simTargetKey}
                  onClick={async () => {
                    const [chargingPointId, connectorId] = simTargetKey.split('::');
                    if (!chargingPointId || !connectorId) return;
                    const numericKw = Number(simLoadKw);
                    const walkInKw = numericKw > 0.5 ? numericKw : 7.4;
                    setSimBusy(true);
                    setSimFeedback(null);
                    try {
                      const res = await onSendOcppTelemetry({
                        chargingPointId,
                        connectorId,
                        eventType: 'WalkInLoadDetected',
                        powerKw: walkInKw,
                        status: 'occupied',
                      });
                      setSimFeedback({
                        type: 'success',
                        text: res.event.summary,
                      });
                    } catch (err) {
                      setSimFeedback({
                        type: 'error',
                        text: (err as Error).message,
                      });
                    } finally {
                      setSimBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Simulate Walk-In Load (&gt;0.5 kW)
                </button>
              </div>
            </div>

            {simFeedback && (
              <div
                role={simFeedback.type === 'error' ? 'alert' : 'status'}
                className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                  simFeedback.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                }`}
              >
                {simFeedback.text}
              </div>
            )}

            {telemetryEvents[0] && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
                <span className="font-mono text-zinc-500">
                  Latest ({telemetryEvents[0].protocol} · {telemetryEvents[0].eventType}):
                </span>
                <span className="font-medium text-zinc-800">
                  {telemetryEvents[0].summary}
                </span>
              </div>
            )}
          </section>

          {/* Live Connector Availability & Walk-In Protection */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Live Connector Availability & Walk-In Protection
                </h3>
                <p className="mt-0.5 text-xs text-zinc-600">
                  If an offline EV plugs in without the app, mark the connector Occupied (Walk-In) to hide it from the map and auto-release unconfirmed holds.
                </p>
              </div>
            </div>

            {connectorFeedback && (
              <div
                role={connectorFeedback.type === 'error' ? 'alert' : 'status'}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
                  connectorFeedback.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                }`}
              >
                {connectorFeedback.type === 'error' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
                <span>{connectorFeedback.text}</span>
              </div>
            )}

            <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {chargingPoints.map((cp) => (
                <div key={cp.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {cp.name}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {cp.hostName} · {cp.address}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold tabular-nums text-zinc-700">
                      ₹{cp.pricePerKwh.toFixed(2)}/kWh
                    </span>
                  </div>

                  <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-zinc-50">
                    {cp.connectors.map((conn) => {
                      const rowKey = `${cp.id}:${conn.id}`;
                      const isRowBusy = connectorBusyKey === rowKey;
                      const statusColor =
                        conn.status === 'available'
                          ? 'text-emerald-700'
                          : conn.status === 'occupied'
                            ? 'text-red-700'
                            : conn.status === 'reserved'
                              ? 'text-amber-700'
                              : 'text-zinc-600';

                      const handleStatusChange = async (
                        nextStatus: 'available' | 'occupied' | 'maintenance'
                      ) => {
                        setConnectorFeedback(null);
                        setConnectorBusyKey(rowKey);
                        try {
                          const cancelled = await onUpdateConnectorStatus(
                            cp.id,
                            conn.id,
                            nextStatus
                          );
                          const suffix =
                            cancelled.length > 0
                              ? ` Auto-cancelled hold(s): ${cancelled.join(', ')}.`
                              : '';
                          setConnectorFeedback({
                            type: 'success',
                            text: `${cp.name} (${conn.id}) marked ${nextStatus}.${suffix}`,
                          });
                        } catch (err) {
                          setConnectorFeedback({
                            type: 'error',
                            text: (err as Error).message,
                          });
                        } finally {
                          setConnectorBusyKey(null);
                        }
                      };

                      return (
                        <div
                          key={conn.id}
                          className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Zap className="h-3.5 w-3.5 text-zinc-500" />
                            <span className="font-semibold text-zinc-900">
                              {conn.type}
                            </span>
                            <span className="font-mono text-zinc-600 tabular-nums">
                              {conn.powerKw} kW
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-zinc-500">
                              {conn.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className={`font-semibold capitalize ${statusColor}`}>
                              {conn.status}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isRowBusy || conn.status === 'available'}
                              onClick={() => handleStatusChange('available')}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              Set Available
                            </button>
                            <button
                              type="button"
                              disabled={isRowBusy || conn.status === 'occupied'}
                              onClick={() => handleStatusChange('occupied')}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              Mark Occupied (Walk-In)
                            </button>
                            <button
                              type="button"
                              disabled={isRowBusy || conn.status === 'maintenance'}
                              onClick={() => handleStatusChange('maintenance')}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              Maintenance
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Onboard New Charger */}
      {subTab === 'onboard' && (
        <form
          onSubmit={handleOnboardSubmit}
          className="rounded-xl border border-zinc-200 bg-white p-6"
        >
          <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">
                List a Charging Point on ImCharge
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Choose a registered host profile or onboard a metered Private
                Host charger (80% payout) or Existing Partner Station (15%
                commission).
              </p>
            </div>
            {onOpenHostRegistration && (
              <button
                type="button"
                onClick={onOpenHostRegistration}
                className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Register New Host Account
              </button>
            )}
          </div>

          <div className="mt-5">
            <label
              htmlFor="onboard-registered-host"
              className="block text-xs font-medium text-zinc-700"
            >
              Registered Host Account
            </label>
            <select
              id="onboard-registered-host"
              value={selectedHostUid}
              onChange={(e) => {
                const uid = e.target.value;
                setSelectedHostUid(uid);
                const matched = hosts.find((h) => h.uid === uid);
                if (matched) {
                  setHostName(matched.name);
                  setHostType(matched.chargingPointType);
                  if (matched.equipment) {
                    setPowerKw(String(matched.equipment.powerKw));
                    setMeterSerialNumber(matched.equipment.meterSerialNumber);
                    if (matched.equipment.connectorType[0]) {
                      setConnectorType(matched.equipment.connectorType[0]);
                    }
                  }
                  if (matched.partnerNetwork)
                    setPartnerName(matched.partnerNetwork);
                  if (matched.partnerStationId)
                    setPartnerStationId(matched.partnerStationId);
                  setAvailabilityHours(matched.availability.weekdays);
                }
              }}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 sm:max-w-md"
            >
              <option value="">Create new host inline...</option>
              {hosts.map((h) => (
                <option key={h.uid} value={h.uid}>
                  {h.name} (
                  {h.chargingPointType === 'private_host'
                    ? 'Private Host'
                    : h.partnerNetwork || 'Partner'}
                  )
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setHostType('private_host')}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                hostType === 'private_host'
                  ? 'border-emerald-600 bg-emerald-50/50'
                  : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <Home className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  Private Host (Home, Office, Shop)
                </div>
                <div className="mt-0.5 text-xs text-zinc-600">
                  Metered Wh verification · You set ₹/kWh · 80% host payout
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setHostType('existing_station')}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                hostType === 'existing_station'
                  ? 'border-emerald-600 bg-emerald-50/50'
                  : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-zinc-700" />
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  Existing Partner Station
                </div>
                <div className="mt-0.5 text-xs text-zinc-600">
                  Ionity, ChargePoint, Fastned OCPI sync · 15% commission split
                </div>
              </div>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="onboard-hostname"
                className="block text-xs font-medium text-zinc-700"
              >
                Host or Operator Name
              </label>
              <input
                id="onboard-hostname"
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Hannah Richter"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="onboard-pointname"
                className="block text-xs font-medium text-zinc-700"
              >
                Charging Point Title
              </label>
              <input
                id="onboard-pointname"
                type="text"
                value={pointName}
                onChange={(e) => setPointName(e.target.value)}
                placeholder="Haidhausen Courtyard Wallbox"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="onboard-address"
                className="block text-xs font-medium text-zinc-700"
              >
                Street Address
              </label>
              <input
                id="onboard-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Weißenburger Platz 6, 81667 München"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="onboard-district"
                className="block text-xs font-medium text-zinc-700"
              >
                Munich District (Map Coordinates)
              </label>
              <select
                id="onboard-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                {Object.entries(DISTRICT_COORDS).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="onboard-connector"
                className="block text-xs font-medium text-zinc-700"
              >
                Connector Type
              </label>
              <select
                id="onboard-connector"
                value={connectorType}
                onChange={(e) =>
                  setConnectorType(e.target.value as ConnectorType)
                }
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                <option value="Type2">Type 2 (AC)</option>
                <option value="CCS">CCS (DC Fast)</option>
                <option value="CHAdeMO">CHAdeMO</option>
                <option value="Type1">Type 1</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="onboard-power"
                className="block text-xs font-medium text-zinc-700"
              >
                Max Output Power (kW)
              </label>
              <input
                id="onboard-power"
                type="number"
                value={powerKw}
                onChange={(e) => setPowerKw(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900"
              />
            </div>

            <div>
              <label
                htmlFor="onboard-price"
                className="block text-xs font-medium text-zinc-700"
              >
                Tariff (₹ / kWh)
              </label>
              <input
                id="onboard-price"
                type="number"
                step="0.01"
                value={pricePerKwh}
                onChange={(e) => setPricePerKwh(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900"
              />
            </div>

            {hostType === 'private_host' ? (
              <div>
                <label
                  htmlFor="onboard-meter"
                  className="block text-xs font-medium text-zinc-700"
                >
                  MID Meter Serial Number
                </label>
                <input
                  id="onboard-meter"
                  type="text"
                  value={meterSerialNumber}
                  onChange={(e) => setMeterSerialNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900"
                />
              </div>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="onboard-partner"
                    className="block text-xs font-medium text-zinc-700"
                  >
                    Partner Network
                  </label>
                  <select
                    id="onboard-partner"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                  >
                    <option value="Ionity">Ionity</option>
                    <option value="ChargePoint">ChargePoint</option>
                    <option value="Fastned">Fastned</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="onboard-stationid"
                    className="block text-xs font-medium text-zinc-700"
                  >
                    Partner Station ID
                  </label>
                  <input
                    id="onboard-stationid"
                    type="text"
                    value={partnerStationId}
                    onChange={(e) => setPartnerStationId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="onboard-hours"
                className="block text-xs font-medium text-zinc-700"
              >
                Availability Hours
              </label>
              <input
                id="onboard-hours"
                type="text"
                value={availabilityHours}
                onChange={(e) => setAvailabilityHours(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label
                htmlFor="onboard-desc"
                className="block text-xs font-medium text-zinc-700"
              >
                Access Instructions & Equipment Notes
              </label>
              <input
                id="onboard-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Covered private bay behind courtyard gate; ring bell #4 on arrival."
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
              />
            </div>
          </div>

          {onboardError && (
            <p className="mt-4 text-xs font-medium text-red-700">
              {onboardError}
            </p>
          )}
          {onboardSuccess && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {onboardSuccess}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Publishing...' : 'Publish Charging Point'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
