import type {
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

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const apiClient = {
  bootstrap: () => requestJson<PlatformSnapshot>('/api/v1/bootstrap'),

  resetDemo: () =>
    requestJson<PlatformSnapshot>('/api/v1/demo/reset', { method: 'POST' }),

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
