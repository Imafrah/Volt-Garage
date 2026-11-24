import type {
  BackupConnectorSuggestion,
  ChargingPoint,
  Connector,
  ConnectorType,
  DriverRegistrationInput,
  GeoPoint,
  HostRegistrationInput,
  LiveTelemetryReading,
  PaymentRecord,
  Reservation,
  ReservationStatus,
} from './types';

export const HOLD_DURATION_MINUTES = 30;
export const PROXIMITY_RADIUS_KM = 10;
export const PRIVATE_HOST_COMMISSION_RATE = 0.2;
export const COMPANY_STATION_COMMISSION_RATE = 0.15;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * Haversine distance in kilometers between two geopoints.
 */
export function calculateDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return round2(earthRadiusKm * c);
}

export function estimateEtaMinutes(distanceKm: number): number {
  if (distanceKm <= 0) return 1;
  // Urban average EV speed ~28 km/h
  return Math.max(2, Math.round((distanceKm / 28) * 60));
}

export function isWithinProximityRadius(
  driverLoc: GeoPoint,
  chargerLoc: GeoPoint,
  maxRadiusKm: number = PROXIMITY_RADIUS_KM
): boolean {
  return calculateDistanceKm(driverLoc, chargerLoc) <= maxRadiusKm;
}

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  reserved: ['confirmed', 'cancelled'],
  confirmed: ['charging', 'cancelled'],
  charging: ['completed', 'disputed', 'cancelled'],
  completed: [],
  disputed: ['completed', 'cancelled'],
  cancelled: [],
};

export function canTransitionReservation(
  from: ReservationStatus,
  to: ReservationStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function createHoldWindow(
  reservedAtMs: number,
  holdMinutes: number = HOLD_DURATION_MINUTES
): { reservedAt: string; expiresAt: string } {
  const reservedAt = new Date(reservedAtMs).toISOString();
  const expiresAt = new Date(reservedAtMs + holdMinutes * 60 * 1000).toISOString();
  return { reservedAt, expiresAt };
}

export function isReservationExpired(
  reservation: Pick<Reservation, 'status' | 'expiresAt'>,
  nowMs: number
): boolean {
  if (reservation.status !== 'reserved') return false;
  return nowMs >= Date.parse(reservation.expiresAt);
}

export function hasConnectorConflict(
  reservations: Reservation[],
  chargingPointId: string,
  connectorId: string,
  nowMs: number
): boolean {
  return reservations.some((res) => {
    if (res.chargingPointId !== chargingPointId || res.connectorId !== connectorId) {
      return false;
    }
    if (res.status === 'confirmed' || res.status === 'charging') {
      return true;
    }
    if (res.status === 'reserved') {
      return !isReservationExpired(res, nowMs);
    }
    return false;
  });
}

export interface MeteredBillingResult {
  energyDeliveredKwh: number;
  grossAmount: number;
  imchargeCommission: number;
  hostPayout: number;
}

/**
 * Private Host metered billing:
 * kWh = (endWh - startWh) / 1000
 * grossAmount = kWh * pricePerKwh
 * imchargeCommission = 20% of grossAmount
 * hostPayout = 80% of grossAmount
 */
export function calculateMeteredBilling(
  meterStartWh: number,
  meterEndWh: number,
  pricePerKwh: number,
  commissionRate: number = PRIVATE_HOST_COMMISSION_RATE
): MeteredBillingResult {
  if (!Number.isFinite(meterStartWh) || !Number.isFinite(meterEndWh)) {
    throw new Error('Meter readings must be valid numbers.');
  }
  if (meterEndWh < meterStartWh) {
    throw new Error('End meter reading cannot be lower than start meter reading.');
  }
  if (pricePerKwh < 0) {
    throw new Error('Price per kWh cannot be negative.');
  }
  const energyDeliveredKwh = round3((meterEndWh - meterStartWh) / 1000);
  const grossAmount = round2(energyDeliveredKwh * pricePerKwh);
  const imchargeCommission = round2(grossAmount * commissionRate);
  const hostPayout = round2(grossAmount - imchargeCommission);

  return {
    energyDeliveredKwh,
    grossAmount,
    imchargeCommission,
    hostPayout,
  };
}

/**
 * Existing company station commission model:
 * Partner bills driver externally; ImCharge receives commission (default 15%).
 */
export function calculateCompanyCommission(
  energyDeliveredKwh: number,
  pricePerKwh: number,
  commissionRate: number = COMPANY_STATION_COMMISSION_RATE
): MeteredBillingResult {
  if (!Number.isFinite(energyDeliveredKwh) || energyDeliveredKwh < 0) {
    throw new Error('Delivered energy must be a non-negative number.');
  }
  const grossAmount = round2(energyDeliveredKwh * pricePerKwh);
  const imchargeCommission = round2(grossAmount * commissionRate);
  return {
    energyDeliveredKwh: round3(energyDeliveredKwh),
    grossAmount,
    imchargeCommission,
    hostPayout: 0,
  };
}

export interface MeterAnomalyReport {
  isAnomaly: boolean;
  reason?: string;
}

export function detectMeterAnomaly(
  meterStartWh: number,
  meterEndWh: number,
  connectorPowerKw: number,
  durationMinutes: number
): MeterAnomalyReport {
  if (meterEndWh < meterStartWh) {
    return {
      isAnomaly: true,
      reason: 'End meter reading is lower than start meter reading.',
    };
  }
  const deliveredKwh = (meterEndWh - meterStartWh) / 1000;
  if (deliveredKwh <= 0) {
    return {
      isAnomaly: true,
      reason: 'Zero energy consumption recorded on meter.',
    };
  }
  if (deliveredKwh > 150) {
    return {
      isAnomaly: true,
      reason: `Delivered energy (${deliveredKwh.toFixed(1)} kWh) exceeds maximum single-session threshold (150 kWh).`,
    };
  }
  const effectiveHours = Math.max(durationMinutes / 60, 0.5);
  const theoreticalMaxKwh = connectorPowerKw * effectiveHours * 1.25;
  if (deliveredKwh > theoreticalMaxKwh) {
    return {
      isAnomaly: true,
      reason: `Meter delta (${deliveredKwh.toFixed(2)} kWh) exceeds physical ${connectorPowerKw} kW hardware ceiling for session duration.`,
    };
  }
  return { isAnomaly: false };
}

export function generateQrToken(reservationId: string): string {
  const suffix = reservationId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || '0000';
  return `IMC-${suffix}-QR`;
}

export function scoreChargingPoint(
  point: ChargingPoint,
  driverLoc: GeoPoint,
  preferredConnectors: ConnectorType[]
): number {
  const distKm = calculateDistanceKm(driverLoc, point.location);
  const hasAvailable = point.connectors.some((c) => c.status === 'available');
  const matchesVehicle =
    preferredConnectors.length === 0 ||
    point.connectors.some(
      (c) => preferredConnectors.includes(c.type) && c.status === 'available'
    );

  let score = 100;
  score -= distKm * 6;
  score -= point.pricePerKwh * 20;
  score += point.rating * 5;
  if (hasAvailable) score += 25;
  if (matchesVehicle) score += 20;
  return round2(score);
}

export function findNearestBackupConnector(
  points: ChargingPoint[],
  excludedPointId: string,
  driverLoc: GeoPoint,
  preferredConnectors: ConnectorType[],
  maxRadiusKm: number = PROXIMITY_RADIUS_KM
): BackupConnectorSuggestion | null {
  const candidates: Array<{
    suggestion: BackupConnectorSuggestion;
    compatible: boolean;
    score: number;
  }> = [];

  for (const point of points) {
    if (point.id === excludedPointId) continue;
    const distanceKm = calculateDistanceKm(driverLoc, point.location);
    if (distanceKm > maxRadiusKm) continue;

    const availableConnectors = point.connectors.filter(
      (c) => c.status === 'available'
    );
    if (availableConnectors.length === 0) continue;

    const compatibleConnectors = availableConnectors.filter((c) =>
      preferredConnectors.includes(c.type)
    );
    const pool: Connector[] =
      compatibleConnectors.length > 0
        ? compatibleConnectors
        : availableConnectors;
    const bestConnector = [...pool].sort((a, b) => b.powerKw - a.powerKw)[0];

    candidates.push({
      suggestion: {
        point,
        connector: bestConnector,
        distanceKm,
        etaMinutes: estimateEtaMinutes(distanceKm),
      },
      compatible:
        preferredConnectors.length === 0 || compatibleConnectors.length > 0,
      score: scoreChargingPoint(point, driverLoc, preferredConnectors),
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
    if (a.suggestion.distanceKm !== b.suggestion.distanceKm) {
      return a.suggestion.distanceKm - b.suggestion.distanceKm;
    }
    return b.score - a.score;
  });

  return candidates[0].suggestion;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegistrationValidationResult =
  | { ok: true; error?: undefined }
  | { ok: false; error: string };

export function validateDriverRegistrationInput(
  input: DriverRegistrationInput
): RegistrationValidationResult {
  if (!input.name?.trim()) {
    return { ok: false, error: 'Full name is required.' };
  }
  if (!input.email?.trim() || !EMAIL_REGEX.test(input.email.trim())) {
    return { ok: false, error: 'A valid email address is required.' };
  }
  if (!input.phone?.trim() || input.phone.trim().length < 6) {
    return { ok: false, error: 'A valid phone number is required.' };
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  if (!input.paymentMethodLabel?.trim()) {
    return { ok: false, error: 'Payment method label is required.' };
  }
  if (
    !input.vehicle?.make?.trim() ||
    !input.vehicle?.model?.trim() ||
    !input.vehicle?.licensePlate?.trim()
  ) {
    return {
      ok: false,
      error: 'EV make, model, and license plate are required.',
    };
  }
  if (
    !Number.isFinite(input.vehicle.batteryCapacity) ||
    input.vehicle.batteryCapacity <= 0
  ) {
    return { ok: false, error: 'EV battery capacity (kWh) must be positive.' };
  }
  if (
    !Array.isArray(input.vehicle.connectorType) ||
    input.vehicle.connectorType.length === 0
  ) {
    return {
      ok: false,
      error: 'Select at least one compatible EV connector type.',
    };
  }
  return { ok: true };
}

export function validateHostRegistrationInput(
  input: HostRegistrationInput
): RegistrationValidationResult {
  if (!input.name?.trim()) {
    return { ok: false, error: 'Host or operator name is required.' };
  }
  if (!input.email?.trim() || !EMAIL_REGEX.test(input.email.trim())) {
    return { ok: false, error: 'A valid email address is required.' };
  }
  if (!input.phone?.trim() || input.phone.trim().length < 6) {
    return { ok: false, error: 'A valid phone number is required.' };
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  if (!input.bankAccountIban?.trim() || input.bankAccountIban.trim().length < 6) {
    return { ok: false, error: 'Payout account / IBAN or UPI ID is required.' };
  }

  if (input.chargingPointType === 'private_host') {
    if (
      !input.equipment?.brand?.trim() ||
      !input.equipment?.model?.trim() ||
      !input.equipment?.meterSerialNumber?.trim()
    ) {
      return {
        ok: false,
        error:
          'Private hosts must enter charger brand, model, and smart meter serial number.',
      };
    }
    if (!Number.isFinite(input.equipment.powerKw) || input.equipment.powerKw <= 0) {
      return { ok: false, error: 'Charger power (kW) must be positive.' };
    }
    if (
      !Array.isArray(input.equipment.connectorType) ||
      input.equipment.connectorType.length === 0
    ) {
      return {
        ok: false,
        error: 'Select at least one charger connector type.',
      };
    }
  } else {
    if (!input.partnerNetwork?.trim() || !input.partnerStationId?.trim()) {
      return {
        ok: false,
        error:
          'Partner operators must provide partner network name and station ID.',
      };
    }
  }

  if (
    !input.availability?.weekdays?.trim() ||
    !input.availability?.weekends?.trim()
  ) {
    return {
      ok: false,
      error: 'Weekday and weekend availability hours are required.',
    };
  }
  return { ok: true };
}

export interface HostPayoutSummary {
  pendingAmountInr: number;
  settledAmountInr: number;
  pendingCount: number;
  settledCount: number;
}

export function summarizeHostPayouts(
  payments: PaymentRecord[],
  hostId?: string
): HostPayoutSummary {
  let pendingAmount = 0;
  let settledAmount = 0;
  let pendingCount = 0;
  let settledCount = 0;

  for (const payment of payments) {
    if (payment.type !== 'payout') continue;
    if (hostId && hostId !== 'all' && payment.hostId !== hostId) continue;

    if (payment.status === 'pending') {
      pendingAmount += payment.amount;
      pendingCount++;
    } else if (payment.status === 'completed') {
      settledAmount += payment.amount;
      settledCount++;
    }
  }

  return {
    pendingAmountInr: round2(pendingAmount),
    settledAmountInr: round2(settledAmount),
    pendingCount,
    settledCount,
  };
}

export function advanceTelemetryReading(
  current: LiveTelemetryReading,
  startMeterWh: number,
  connectorPowerKw: number,
  pricePerKwh: number,
  stepSeconds: number,
  nowIso: string,
  energyScaleFactor: number = 1
): LiveTelemetryReading {
  const safeStep = Math.max(0, stepSeconds);
  const effectivePowerKw = round2(
    Math.min(connectorPowerKw, Math.max(0.5, current.livePowerKw || connectorPowerKw * 0.92))
  );
  const deltaKwh =
    (effectivePowerKw * (safeStep * Math.max(1, energyScaleFactor))) / 3600;
  const nextDeliveredKwh = round3(current.deliveredKwh + deltaKwh);
  const nextMeterWh = Math.round(startMeterWh + nextDeliveredKwh * 1000);
  const nextCostInr = round2(nextDeliveredKwh * pricePerKwh);

  return {
    ...current,
    livePowerKw: effectivePowerKw,
    deliveredKwh: nextDeliveredKwh,
    currentMeterWh: nextMeterWh,
    estimatedCostInr: nextCostInr,
    elapsedSeconds: current.elapsedSeconds + safeStep,
    lastUpdatedAt: nowIso,
  };
}

export function isUnbookedWalkInLoad(
  powerKw: number,
  hasActiveSessionOnConnector: boolean,
  thresholdKw: number = 0.5
): boolean {
  return !hasActiveSessionOnConnector && Number.isFinite(powerKw) && powerKw > thresholdKw;
}

export interface OutOfRangeReservation {
  reservation: Reservation;
  distanceKm: number;
}

export function findOutOfRangeReservations(
  reservations: Reservation[],
  chargingPoints: ChargingPoint[],
  driverId: string,
  driverLocation: GeoPoint,
  maxRadiusKm: number = PROXIMITY_RADIUS_KM
): OutOfRangeReservation[] {
  const outOfRange: OutOfRangeReservation[] = [];
  for (const res of reservations) {
    if (res.driverId !== driverId || res.status !== 'reserved') continue;
    const cp = chargingPoints.find((p) => p.id === res.chargingPointId);
    if (!cp) continue;
    const distanceKm = calculateDistanceKm(driverLocation, cp.location);
    if (distanceKm > maxRadiusKm) {
      outOfRange.push({ reservation: res, distanceKm });
    }
  }
  return outOfRange;
}
