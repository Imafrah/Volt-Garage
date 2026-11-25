import type {
  AuthLoginInput,
  BackupConnectorSuggestion,
  ChargingPoint,
  ChargingSession,
  ConnectorType,
  DriverProfile,
  DriverRegistrationInput,
  GeoPoint,
  HostProfile,
  HostRegistrationInput,
  OcppTelemetryPayload,
  PartnerIntegration,
  PlatformSnapshot,
  Reservation,
  Review,
  TelemetryEventRecord,
  Vehicle,
} from '../domain/types';

const SNAPSHOT_CACHE_KEY = 'voltgarage_snapshot_v1';

let cachedSnapshot: PlatformSnapshot | null = loadCachedSnapshot();

function loadCachedSnapshot(): PlatformSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlatformSnapshot;
    if (parsed && Array.isArray(parsed.chargingPoints) && typeof parsed.revision === 'number') {
      return parsed;
    }
  } catch {
    // Ignore invalid storage entries
  }
  return null;
}

export function getCachedSnapshot(): PlatformSnapshot | null {
  return cachedSnapshot;
}

export function setCachedSnapshot(snapshot: PlatformSnapshot | null): void {
  cachedSnapshot = snapshot;
  if (typeof window === 'undefined') return;
  try {
    if (!snapshot) {
      window.localStorage.removeItem(SNAPSHOT_CACHE_KEY);
    } else {
      window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function buildCompactSyncState(snap: PlatformSnapshot): Partial<PlatformSnapshot> {
  return {
    drivers: snap.drivers,
    hosts: snap.hosts,
    chargingPoints: snap.chargingPoints,
    reservations: snap.reservations,
    sessions: snap.sessions,
    payments: snap.payments,
    reviews: snap.reviews,
    partners: snap.partners,
    liveTelemetry: snap.liveTelemetry,
    telemetryEvents: snap.telemetryEvents,
    telemetryHeartbeatEnabled: snap.telemetryHeartbeatEnabled,
    revision: snap.revision,
    resetEpoch: snap.resetEpoch,
  };
}

async function requestJson<T>(
  url: string,
  options?: RequestInit,
  syncOptions?: { skipSync?: boolean; isReset?: boolean }
): Promise<T> {
  let finalOptions: RequestInit | undefined = options;
  const method = (options?.method || 'GET').toUpperCase();

  if (
    method === 'POST' &&
    !syncOptions?.skipSync &&
    !syncOptions?.isReset &&
    cachedSnapshot &&
    (cachedSnapshot.serverMode === 'serverless' || (cachedSnapshot.revision ?? 1) > 1)
  ) {
    let bodyObj: Record<string, unknown> = {};
    if (typeof options?.body === 'string' && options.body.trim()) {
      try {
        bodyObj = JSON.parse(options.body) as Record<string, unknown>;
      } catch {
        bodyObj = {};
      }
    }
    finalOptions = {
      ...options,
      body: JSON.stringify({
        ...bodyObj,
        _syncState: buildCompactSyncState(cachedSnapshot),
      }),
    };
  }

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...finalOptions,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  if (syncOptions?.isReset) {
    setCachedSnapshot(data as PlatformSnapshot);
  } else if (data && typeof data === 'object') {
    if ('snapshot' in data && data.snapshot) {
      setCachedSnapshot(data.snapshot as PlatformSnapshot);
    } else if ('chargingPoints' in data && 'reservations' in data) {
      setCachedSnapshot(data as PlatformSnapshot);
    }
  }

  return data as T;
}

export const apiClient = {
  bootstrap: async (): Promise<PlatformSnapshot> => {
    const serverSnap = await requestJson<PlatformSnapshot>(
      '/api/v1/bootstrap',
      undefined,
      { skipSync: true }
    );
    const localSnap = cachedSnapshot;
    const shouldRehydrateServerless =
      serverSnap.serverMode === 'serverless' &&
      localSnap &&
      typeof localSnap.revision === 'number' &&
      localSnap.revision > (serverSnap.revision ?? 1) &&
      (localSnap.resetEpoch === serverSnap.resetEpoch || (serverSnap.revision ?? 1) <= 1);

    if (shouldRehydrateServerless && localSnap) {
      const synced = await requestJson<{ snapshot: PlatformSnapshot }>(
        '/api/v1/state/sync',
        {
          method: 'POST',
          body: JSON.stringify({ snapshot: buildCompactSyncState(localSnap) }),
        },
        { skipSync: true }
      );
      setCachedSnapshot(synced.snapshot);
      return synced.snapshot;
    }

    setCachedSnapshot(serverSnap);
    return serverSnap;
  },

  resetDemo: () =>
    requestJson<PlatformSnapshot>(
      '/api/v1/demo/reset',
      { method: 'POST' },
      { isReset: true }
    ),

  login: (payload: AuthLoginInput) =>
    requestJson<{
      role: 'driver' | 'host';
      driver?: DriverProfile;
      host?: HostProfile;
      snapshot: PlatformSnapshot;
    }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

  registerDriver: (payload: DriverRegistrationInput) =>
    requestJson<{ driver: DriverProfile; snapshot: PlatformSnapshot }>(
      '/api/v1/drivers/register',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  registerHost: (payload: HostRegistrationInput) =>
    requestJson<{ host: HostProfile; snapshot: PlatformSnapshot }>(
      '/api/v1/hosts/register',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  addVehicle: (driverId: string, payload: Omit<Vehicle, 'id'>) =>
    requestJson<{ vehicle: Vehicle; snapshot: PlatformSnapshot }>(
      `/api/v1/drivers/${encodeURIComponent(driverId)}/vehicles`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  updateDriverLocation: (driverId: string, location: GeoPoint) =>
    requestJson<{
      driver: DriverProfile;
      autoReleasedReservations: Reservation[];
      snapshot: PlatformSnapshot;
    }>(`/api/v1/drivers/${encodeURIComponent(driverId)}/location`, {
      method: 'POST',
      body: JSON.stringify(location),
    }),

  createChargingPoint: (payload: {
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
  }) =>
    requestJson<{ chargingPoint: ChargingPoint; snapshot: PlatformSnapshot }>(
      '/api/v1/charging-points',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  createReservation: (payload: {
    driverId: string;
    chargingPointId: string;
    connectorId: string;
    driverLocation?: GeoPoint;
    enforceProximity?: boolean;
    notes?: string;
  }) =>
    requestJson<{ reservation: Reservation; snapshot: PlatformSnapshot }>(
      '/api/v1/reservations',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  confirmReservation: (resId: string, qrToken: string) =>
    requestJson<{ reservation: Reservation; snapshot: PlatformSnapshot }>(
      `/api/v1/reservations/${encodeURIComponent(resId)}/confirm`,
      { method: 'POST', body: JSON.stringify({ qrToken }) }
    ),

  cancelReservation: (resId: string) =>
    requestJson<{ reservation: Reservation; snapshot: PlatformSnapshot }>(
      `/api/v1/reservations/${encodeURIComponent(resId)}/cancel`,
      { method: 'POST' }
    ),

  reportBlockedBay: (resId: string) =>
    requestJson<{
      reservation: Reservation;
      backupSuggestion: BackupConnectorSuggestion | null;
      snapshot: PlatformSnapshot;
    }>(
      `/api/v1/reservations/${encodeURIComponent(resId)}/report-blocked`,
      { method: 'POST' }
    ),

  updateConnectorStatus: (
    pointId: string,
    connectorId: string,
    status: 'available' | 'occupied' | 'maintenance',
    reason?: string
  ) =>
    requestJson<{
      point: ChargingPoint;
      cancelledReservationIds: string[];
      snapshot: PlatformSnapshot;
    }>(
      `/api/v1/charging-points/${encodeURIComponent(pointId)}/connectors/${encodeURIComponent(connectorId)}/status`,
      { method: 'POST', body: JSON.stringify({ status, reason }) }
    ),

  startSession: (payload: {
    reservationId: string;
    meterReadingStartWh?: number;
  }) =>
    requestJson<{ session: ChargingSession; snapshot: PlatformSnapshot }>(
      '/api/v1/charging-sessions',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  endSession: (
    sessionId: string,
    payload: {
      meterReadingEndWh?: number;
      partnerEnergyKwh?: number;
      flagDispute?: boolean;
      disputeReason?: string;
    }
  ) =>
    requestJson<{ session: ChargingSession; snapshot: PlatformSnapshot }>(
      `/api/v1/charging-sessions/${encodeURIComponent(sessionId)}/end`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  addReview: (payload: {
    chargingPointId: string;
    driverId: string;
    rating: number;
    comment: string;
  }) =>
    requestJson<{ review: Review; snapshot: PlatformSnapshot }>(
      '/api/v1/reviews',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  resolveDispute: (
    sessionId: string,
    payload: { action: 'approve_adjusted' | 'refund'; adjustedMeterEndWh?: number }
  ) =>
    requestJson<{ session: ChargingSession; snapshot: PlatformSnapshot }>(
      `/api/v1/admin/disputes/${encodeURIComponent(sessionId)}/resolve`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  syncPartner: (partnerId: string) =>
    requestJson<{ partner: PartnerIntegration; snapshot: PlatformSnapshot }>(
      `/api/v1/admin/partners/${encodeURIComponent(partnerId)}/sync`,
      { method: 'POST' }
    ),

  processHostPayouts: (hostId: string) =>
    requestJson<{ processedCount: number; snapshot: PlatformSnapshot }>(
      `/api/v1/hosts/${encodeURIComponent(hostId)}/payouts/process`,
      { method: 'POST' }
    ),

  sendOcppTelemetry: (payload: OcppTelemetryPayload) =>
    requestJson<{
      event: TelemetryEventRecord;
      cancelledReservationIds: string[];
      snapshot: PlatformSnapshot;
    }>('/api/v1/telemetry/ocpp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  setTelemetryHeartbeat: (enabled: boolean) =>
    requestJson<{ enabled: boolean; snapshot: PlatformSnapshot }>(
      '/api/v1/telemetry/heartbeat',
      { method: 'POST', body: JSON.stringify({ enabled }) }
    ),
};
