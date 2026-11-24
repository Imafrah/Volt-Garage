import { useCallback, useEffect, useState } from 'react';
import { Car, Compass, Home, RotateCcw, UserPlus } from 'lucide-react';
import { apiClient } from './api/client';
import { DriverTripsView } from './components/DriverTripsView';
import { ExploreView } from './components/ExploreView';
import { HostConsoleView, type HostSubTab } from './components/HostConsoleView';
import { VoltGarageHero } from './components/VoltGarageHero';
import {
  RegistrationModal,
  type RegistrationRole,
} from './components/RegistrationModal';
import {
  TelemetryStreamIndicator,
  type SseConnectionStatus,
} from './components/TelemetryStreamIndicator';
import type {
  BackupConnectorSuggestion,
  ConnectorType,
  DriverRegistrationInput,
  GeoPoint,
  HostRegistrationInput,
  OcppTelemetryPayload,
  PlatformSnapshot,
  Reservation,
  Vehicle,
} from './domain/types';

type ActiveView = 'explore' | 'trips' | 'host';

export default function App() {
  const [snapshot, setSnapshot] = useState<PlatformSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('explore');
  const [hostInitialTab, setHostInitialTab] = useState<HostSubTab>('queue');
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);
  const [activeHostId, setActiveHostId] = useState<string | null>(null);
  const [registrationRole, setRegistrationRole] =
    useState<RegistrationRole | null>(null);
  const [sseStatus, setSseStatus] = useState<SseConnectionStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine
      ? 'reconnecting'
      : 'reconnecting'
  );

  const fetchSnapshot = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await apiClient.bootstrap();
      setSnapshot(data);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;

    const clearRetry = () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      clearRetry();
      if (source) {
        source.close();
        source = null;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSseStatus('reconnecting');
        return;
      }

      source = new EventSource('/api/v1/telemetry/stream');

      const onOpen = () => {
        if (!disposed) setSseStatus('live');
      };

      const onSnapshot = (event: MessageEvent) => {
        try {
          const next = JSON.parse(event.data) as PlatformSnapshot;
          if (!disposed) {
            setSnapshot(next);
            setLoadError(null);
            setSseStatus('live');
          }
        } catch {
          // Ignore malformed SSE payload
        }
      };

      const onError = () => {
        if (disposed) return;
        setSseStatus('reconnecting');
        if (source && source.readyState === EventSource.CLOSED) {
          source.close();
          source = null;
          retryTimer = window.setTimeout(connect, 2000);
        }
      };

      source.addEventListener('open', onOpen);
      source.addEventListener('snapshot', onSnapshot as EventListener);
      source.addEventListener('error', onError);
    };

    const handleOffline = () => {
      if (disposed) return;
      setSseStatus('reconnecting');
      if (source) {
        source.close();
        source = null;
      }
    };

    const handleOnline = () => {
      if (disposed) return;
      setSseStatus('reconnecting');
      connect();
    };

    connect();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      clearRetry();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (source) {
        source.close();
      }
    };
  }, []);

  const primaryDriver =
    snapshot?.drivers.find((d) => d.uid === activeDriverId) ??
    snapshot?.drivers[0] ??
    null;

  async function handleRegisterDriver(payload: DriverRegistrationInput) {
    const res = await apiClient.registerDriver(payload);
    setSnapshot(res.snapshot);
    setActiveDriverId(res.driver.uid);
    setRegistrationRole(null);
    setActiveView('trips');
  }

  async function handleRegisterHost(payload: HostRegistrationInput) {
    const res = await apiClient.registerHost(payload);
    setSnapshot(res.snapshot);
    setActiveHostId(res.host.uid);
    setRegistrationRole(null);
    setHostInitialTab('onboard');
    setActiveView('host');
  }

  async function handleReserve(
    chargingPointId: string,
    connectorId: string,
    enforceProximity: boolean
  ) {
    if (!primaryDriver) return;
    const res = await apiClient.createReservation({
      driverId: primaryDriver.uid,
      chargingPointId,
      connectorId,
      driverLocation: primaryDriver.defaultLocation,
      enforceProximity,
    });
    setSnapshot(res.snapshot);
  }

  async function handleAddVehicle(payload: Omit<Vehicle, 'id'>) {
    if (!primaryDriver) return;
    const res = await apiClient.addVehicle(primaryDriver.uid, payload);
    setSnapshot(res.snapshot);
  }

  async function handleUpdateDriverLocation(
    location: GeoPoint
  ): Promise<Reservation[]> {
    if (!primaryDriver) return [];
    const res = await apiClient.updateDriverLocation(primaryDriver.uid, location);
    setSnapshot(res.snapshot);
    return res.autoReleasedReservations;
  }

  async function handleConfirmReservation(resId: string, qrToken: string) {
    const res = await apiClient.confirmReservation(resId, qrToken);
    setSnapshot(res.snapshot);
  }

  async function handleCancelReservation(resId: string) {
    const res = await apiClient.cancelReservation(resId);
    setSnapshot(res.snapshot);
  }

  async function handleReportBlockedBay(
    resId: string
  ): Promise<BackupConnectorSuggestion | null> {
    const res = await apiClient.reportBlockedBay(resId);
    setSnapshot(res.snapshot);
    return res.backupSuggestion;
  }

  async function handleReserveBackup(
    chargingPointId: string,
    connectorId: string
  ) {
    await handleReserve(chargingPointId, connectorId, true);
  }

  async function handleUpdateConnectorStatus(
    pointId: string,
    connectorId: string,
    status: 'available' | 'occupied' | 'maintenance',
    reason?: string
  ): Promise<string[]> {
    const res = await apiClient.updateConnectorStatus(
      pointId,
      connectorId,
      status,
      reason
    );
    setSnapshot(res.snapshot);
    return res.cancelledReservationIds;
  }

  async function handleStartSession(
    reservationId: string,
    meterReadingStartWh?: number
  ) {
    const res = await apiClient.startSession({
      reservationId,
      meterReadingStartWh,
    });
    setSnapshot(res.snapshot);
  }

  async function handleEndSession(
    sessionId: string,
    payload: {
      meterReadingEndWh?: number;
      partnerEnergyKwh?: number;
      flagDispute?: boolean;
      disputeReason?: string;
    }
  ) {
    const res = await apiClient.endSession(sessionId, payload);
    setSnapshot(res.snapshot);
  }

  async function handleSubmitReview(payload: {
    chargingPointId: string;
    rating: number;
    comment: string;
  }) {
    if (!primaryDriver) return;
    const res = await apiClient.addReview({
      chargingPointId: payload.chargingPointId,
      driverId: primaryDriver.uid,
      rating: payload.rating,
      comment: payload.comment,
    });
    setSnapshot(res.snapshot);
  }

  async function handleCreateChargingPoint(payload: {
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
  }) {
    const res = await apiClient.createChargingPoint(payload);
    setSnapshot(res.snapshot);
  }

  async function handleProcessPayouts(hostId: string) {
    const res = await apiClient.processHostPayouts(hostId);
    setSnapshot(res.snapshot);
  }

  async function handleSendOcppTelemetry(payload: OcppTelemetryPayload) {
    const res = await apiClient.sendOcppTelemetry(payload);
    setSnapshot(res.snapshot);
    return {
      event: res.event,
      cancelledReservationIds: res.cancelledReservationIds,
    };
  }

  async function handleToggleHeartbeat(enabled: boolean) {
    const res = await apiClient.setTelemetryHeartbeat(enabled);
    setSnapshot(res.snapshot);
  }

  async function handleResetDemo() {
    const data = await apiClient.resetDemo();
    setSnapshot(data);
    setActiveDriverId(data.drivers[0]?.uid ?? null);
    setActiveHostId(null);
  }

  const navItems: { id: ActiveView; label: string; mobileLabel: string; icon: typeof Compass }[] = [
    { id: 'explore', label: 'Explore Map', mobileLabel: 'Map', icon: Compass },
    { id: 'trips', label: 'Driver Trips', mobileLabel: 'Trips', icon: Car },
    { id: 'host', label: 'Host Console', mobileLabel: 'Host', icon: Home },
  ];

  return (
    <div className="min-h-screen bg-zinc-50/50 text-zinc-900 font-sans">
      {/* Precision Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-6 sm:px-6 sm:py-3">
          <div className="flex items-center gap-4 sm:gap-6">
            <a
              href="#explore"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('explore');
              }}
              className="group flex items-center gap-2.5 text-zinc-900 whitespace-nowrap shrink-0"
            >
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
                <img src="/logo.png" alt="Volt Garage Logo" className="h-full w-full object-contain p-0.5" />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-sm font-bold tracking-tight text-zinc-900 sm:text-base">
                  Volt Garage
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  ImCharge v2.4
                </span>
              </div>
            </a>

            {/* Desktop Segmented Console Nav */}
            <nav
              aria-label="Primary workspace navigation"
              className="hidden sm:flex items-center rounded-lg border border-zinc-200/80 bg-zinc-100/70 p-1 text-xs font-medium"
            >
              {navItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'host') setHostInitialTab('queue');
                      setActiveView(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    className={`whitespace-nowrap shrink-0 rounded-md px-3.5 py-1.5 transition-[color,background-color,shadow] ${
                      isActive
                        ? 'bg-white font-semibold text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Action Buttons: Unified Palette and Proportions */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={handleResetDemo}
              title="Reset demo data to initial state"
              aria-label="Reset Demo Data"
              className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            >
              <RotateCcw className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              type="button"
              onClick={() => setRegistrationRole('driver')}
              title="Register as EV Vehicle Owner"
              aria-label="Register as EV Vehicle Owner"
              className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
            >
              <Car className="h-3.5 w-3.5 text-zinc-500" />
              <span className="hidden md:inline">Register EV</span>
              <span className="md:hidden text-[11px]">EV</span>
            </button>
            <button
              type="button"
              onClick={() => setRegistrationRole('host')}
              title="Register as Charging Host"
              aria-label="Register as Charging Host"
              className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <Home className="h-3.5 w-3.5 text-zinc-300" />
              <span className="hidden md:inline">Register Host</span>
              <span className="md:hidden text-[11px]">Host</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-zinc-200/90 bg-white/95 px-2 py-1.5 backdrop-blur-md sm:hidden shadow-sm"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'host') setHostInitialTab('queue');
                setActiveView(item.id);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-zinc-900 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-600' : 'text-zinc-400'}`} />
              <span>{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Full-Bleed Edge-to-Edge Hero Banner (Explore View) */}
      {!loading && !loadError && snapshot && primaryDriver && activeView === 'explore' && (
        <VoltGarageHero
          onExploreClick={() => {
            const el = document.getElementById('charger-search');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          onHostClick={() => {
            setHostInitialTab('onboard');
            setActiveView('host');
          }}
        />
      )}

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 pb-20 sm:pb-6">
        {loading ? (
          <div
            aria-label="Loading marketplace"
            className="space-y-6"
          >
            <div className="h-14 animate-pulse rounded-xl border border-zinc-200 bg-white" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="h-96 animate-pulse rounded-xl border border-zinc-200 bg-white lg:col-span-7" />
              <div className="h-96 animate-pulse rounded-xl border border-zinc-200 bg-white lg:col-span-5" />
            </div>
          </div>
        ) : loadError || !snapshot || !primaryDriver ? (
          <div
            role="alert"
            className="mx-auto max-w-xl rounded-2xl border border-zinc-200/90 bg-white p-8 text-center shadow-xs"
          >
            <div className="mx-auto mb-3.5 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
              <RotateCcw className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-zinc-900">
              Connecting to ImCharge Gateway
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-zinc-500">
              {loadError?.includes('Unexpected token') || loadError?.includes('JSON')
                ? 'The serverless backend instance is warming up on Vercel. This initial cold start typically takes 5–8 seconds.'
                : loadError || 'Marketplace telemetry service is establishing a secure connection.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  fetchSnapshot();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry Gateway Connection
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Contextual Page Header (for Trips and Host consoles) */}
            {activeView !== 'explore' && (
              <div className="flex flex-col gap-3 border-b border-zinc-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 text-balance">
                    {activeView === 'trips' &&
                      'Reservations & Metered Billing'}
                    {activeView === 'host' &&
                      'Host Console & Meter Verification'}
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-zinc-500 max-w-2xl">
                    {activeView === 'trips' &&
                      'Manage your EV garage, confirm QR arrival tokens, track charging sessions, and rate hosts.'}
                    {activeView === 'host' &&
                      'Verify arriving drivers, record start/end smart meter readings (Wh), and settle 80% payouts.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="hidden sm:inline">Active EV Owner:</span>
                  {snapshot.drivers.length > 1 ? (
                    <select
                      aria-label="Select active EV Owner"
                      value={primaryDriver.uid}
                      onChange={(e) => setActiveDriverId(e.target.value)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900"
                    >
                      {snapshot.drivers.map((d) => (
                        <option key={d.uid} value={d.uid}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-medium text-zinc-900">
                      {primaryDriver.name}
                    </span>
                  )}
                  {primaryDriver.vehicles[0] && (
                    <>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline font-mono text-zinc-700">
                        {primaryDriver.vehicles[0].make}{' '}
                        {primaryDriver.vehicles[0].model}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setRegistrationRole('driver')}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <UserPlus className="h-3 w-3" />
                    <span>+ New Driver</span>
                  </button>
                </div>
              </div>
            )}

            {activeView === 'explore' && (
              <ExploreView
                points={snapshot.chargingPoints}
                reviews={snapshot.reviews}
                reservations={snapshot.reservations}
                driver={primaryDriver}
                onReserve={handleReserve}
                onUpdateDriverLocation={handleUpdateDriverLocation}
                onGoToTrips={() => setActiveView('trips')}
              />
            )}

            {activeView === 'trips' && (
              <DriverTripsView
                driver={primaryDriver}
                chargingPoints={snapshot.chargingPoints}
                reservations={snapshot.reservations}
                sessions={snapshot.sessions}
                payments={snapshot.payments}
                liveTelemetry={snapshot.liveTelemetry}
                onAddVehicle={handleAddVehicle}
                onConfirmReservation={handleConfirmReservation}
                onCancelReservation={handleCancelReservation}
                onReportBlockedBay={handleReportBlockedBay}
                onReserveBackup={handleReserveBackup}
                onStartSession={handleStartSession}
                onEndSession={handleEndSession}
                onSubmitReview={handleSubmitReview}
                onExploreMap={() => setActiveView('explore')}
                onOpenDriverRegistration={() => setRegistrationRole('driver')}
              />
            )}

            {activeView === 'host' && (
              <HostConsoleView
                hosts={snapshot.hosts}
                chargingPoints={snapshot.chargingPoints}
                reservations={snapshot.reservations}
                sessions={snapshot.sessions}
                payments={snapshot.payments}
                liveTelemetry={snapshot.liveTelemetry}
                telemetryEvents={snapshot.telemetryEvents}
                telemetryHeartbeatEnabled={snapshot.telemetryHeartbeatEnabled}
                initialTab={hostInitialTab}
                activeHostId={activeHostId}
                onOpenHostRegistration={() => setRegistrationRole('host')}
                onCreateChargingPoint={handleCreateChargingPoint}
                onConfirmReservation={handleConfirmReservation}
                onStartSession={handleStartSession}
                onEndSession={handleEndSession}
                onProcessPayouts={handleProcessPayouts}
                onUpdateConnectorStatus={handleUpdateConnectorStatus}
                onSendOcppTelemetry={handleSendOcppTelemetry}
                onToggleHeartbeat={handleToggleHeartbeat}
              />
            )}
          </div>
        )}
      </main>

      {(activeView === 'explore' ||
        activeView === 'trips' ||
        activeView === 'host') && (
        <TelemetryStreamIndicator status={sseStatus} />
      )}

      {registrationRole && (
        <RegistrationModal
          initialRole={registrationRole}
          onClose={() => setRegistrationRole(null)}
          onRegisterDriver={handleRegisterDriver}
          onRegisterHost={handleRegisterHost}
        />
      )}
    </div>
  );
}
