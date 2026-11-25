import { describe, expect, it } from 'vitest';
import {
  PROXIMITY_RADIUS_KM,
  advanceTelemetryReading,
  calculateCompanyCommission,
  calculateDistanceKm,
  calculateIdleOverstayFee,
  calculateMeteredBilling,
  canTransitionReservation,
  createHoldWindow,
  detectMeterAnomaly,
  estimateEtaMinutes,
  findNearestBackupConnector,
  findOutOfRangeReservations,
  generateQrToken,
  hasConnectorConflict,
  isReservationExpired,
  isUnbookedWalkInLoad,
  isWithinProximityRadius,
  round2,
  round3,
  scoreChargingPoint,
  summarizeHostPayouts,
  validateDriverRegistrationInput,
  validateHostRegistrationInput,
} from './imchargeEngine';
import type {
  ChargingPoint,
  LiveTelemetryReading,
  PaymentRecord,
  Reservation,
} from './types';

function makePoint(overrides: Partial<ChargingPoint> = {}): ChargingPoint {
  return {
    id: 'cp-1',
    hostUid: 'host-1',
    hostName: 'Test Host',
    type: 'private_host',
    location: { lat: 48.138, lon: 11.577 },
    address: 'Maximilianstr. 12',
    name: 'Test Point',
    description: '11 kW AC wallbox',
    connectors: [{ id: 'c1', type: 'Type2', powerKw: 22, status: 'available' }],
    pricePerKwh: 18,
    commissionRate: 0.2,
    rating: 4.5,
    reviewCount: 10,
    photos: [],
    availabilityHours: '24/7',
    kycVerified: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'res-1',
    driverId: 'drv-1',
    driverName: 'Elena',
    hostId: 'host-1',
    chargingPointId: 'cp-1',
    chargingPointName: 'Home Wallbox',
    chargingPointType: 'private_host',
    connectorId: 'c1',
    connectorType: 'Type2',
    powerKw: 11,
    pricePerKwh: 18,
    status: 'reserved',
    reservedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    qrCodeToken: 'IMC-RES1-QR',
    distanceKm: 1.2,
    ...overrides,
  };
}

describe('rounding helpers', () => {
  it('round2 rounds currency values to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1);
    expect(round2(0)).toBe(0);
    expect(round2(99.999)).toBe(100);
  });

  it('round3 rounds energy readings to 3 decimal places', () => {
    expect(round3(1.0005)).toBe(1.001);
    expect(round3(1.0004)).toBe(1);
  });
});

describe('Haversine distance and 10 km proximity geofence', () => {
  const marienplatz = { lat: 48.137154, lon: 11.576124 };
  const schwabing = { lat: 48.1618, lon: 11.5861 };
  const garching = { lat: 48.2489, lon: 11.651 }; // ~13.6 km
  const airport = { lat: 48.3537, lon: 11.775 };

  it('returns 0 for identical coordinates and accurate urban distance', () => {
    expect(PROXIMITY_RADIUS_KM).toBe(10);
    expect(calculateDistanceKm(marienplatz, marienplatz)).toBe(0);

    const distSchwabing = calculateDistanceKm(marienplatz, schwabing);
    expect(distSchwabing).toBeGreaterThan(2.5);
    expect(distSchwabing).toBeLessThan(3.5);
  });

  it('calculates long-distance Munich to Stuttgart (~190 km)', () => {
    const stuttgart = { lat: 48.775, lon: 9.182 };
    const dist = calculateDistanceKm(marienplatz, stuttgart);
    expect(dist).toBeGreaterThan(180);
    expect(dist).toBeLessThan(200);
  });

  it('enforces 10 km default radius and custom radii', () => {
    expect(isWithinProximityRadius(marienplatz, schwabing)).toBe(true);
    expect(isWithinProximityRadius(marienplatz, garching)).toBe(false);
    expect(isWithinProximityRadius(marienplatz, airport)).toBe(false);
    expect(isWithinProximityRadius(marienplatz, schwabing, 1)).toBe(false);
    expect(isWithinProximityRadius(marienplatz, schwabing, 5)).toBe(true);
  });

  it('estimates ETA in minutes assuming ~28 km/h urban speed', () => {
    expect(estimateEtaMinutes(0)).toBe(1);
    expect(estimateEtaMinutes(0.1)).toBe(2);
    expect(estimateEtaMinutes(14)).toBe(30);
  });
});

describe('calculateIdleOverstayFee', () => {
  it('returns zero fee inside the 15-minute free grace window', () => {
    const now = new Date('2026-11-25T10:10:00.000Z');
    const completedAt = '2026-11-25T10:00:00.000Z';
    const result = calculateIdleOverstayFee(completedAt, now.toISOString());
    expect(result.isOverstay).toBe(false);
    expect(result.idleMinutesCharged).toBe(0);
    expect(result.idleFee).toBe(0);
    expect(result.graceMinutes).toBe(15);
  });

  it('bills ₹2.50/min after the 15-minute grace period expires', () => {
    const completedAt = '2026-11-25T10:00:00.000Z';
    const unpluggedAt = '2026-11-25T10:35:00.000Z';
    const result = calculateIdleOverstayFee(completedAt, unpluggedAt);
    expect(result.isOverstay).toBe(true);
    expect(result.minutesElapsed).toBe(35);
    expect(result.idleMinutesCharged).toBe(20);
    expect(result.idleFee).toBe(50);
  });

  it('supports custom grace period and per-minute rate', () => {
    const result = calculateIdleOverstayFee(
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T10:30:00.000Z',
      10,
      5
    );
    expect(result.graceMinutes).toBe(10);
    expect(result.idleMinutesCharged).toBe(20);
    expect(result.idleFee).toBe(100);
  });

  it('handles unplug before completion and invalid timestamps safely', () => {
    expect(
      calculateIdleOverstayFee(
        '2026-01-01T10:30:00.000Z',
        '2026-01-01T10:00:00.000Z'
      ).idleFee
    ).toBe(0);
    expect(calculateIdleOverstayFee('invalid', 'invalid').idleFee).toBe(0);
  });
});

describe('reservation state machine, hold window, and conflict guard', () => {
  it('enforces valid reservation state transitions', () => {
    expect(canTransitionReservation('reserved', 'confirmed')).toBe(true);
    expect(canTransitionReservation('reserved', 'cancelled')).toBe(true);
    expect(canTransitionReservation('reserved', 'charging')).toBe(false);
    expect(canTransitionReservation('confirmed', 'charging')).toBe(true);
    expect(canTransitionReservation('charging', 'completed')).toBe(true);
    expect(canTransitionReservation('charging', 'disputed')).toBe(true);
    expect(canTransitionReservation('disputed', 'completed')).toBe(true);
    expect(canTransitionReservation('completed', 'cancelled')).toBe(false);
    expect(canTransitionReservation('completed', 'reserved')).toBe(false);
    expect(canTransitionReservation('cancelled', 'charging')).toBe(false);
  });

  it('creates 30-minute hold window, checks expiry, and blocks double booking', () => {
    const now = Date.parse('2026-11-23T10:00:00.000Z');
    const hold = createHoldWindow(now, 30);
    expect(hold.expiresAt).toBe('2026-11-23T10:30:00.000Z');

    const activeRes = makeReservation({
      reservedAt: hold.reservedAt,
      expiresAt: hold.expiresAt,
    });

    expect(isReservationExpired(activeRes, now + 29 * 60_000)).toBe(false);
    expect(isReservationExpired(activeRes, now + 30 * 60_000)).toBe(true);
    expect(
      isReservationExpired({ status: 'confirmed', expiresAt: hold.expiresAt }, now + 60 * 60_000)
    ).toBe(false);

    expect(hasConnectorConflict([activeRes], 'cp-1', 'c1', now + 10 * 60_000)).toBe(true);
    expect(hasConnectorConflict([activeRes], 'cp-1', 'c1', now + 31 * 60_000)).toBe(false);
    expect(hasConnectorConflict([activeRes], 'cp-1', 'c2', now + 10 * 60_000)).toBe(false);
    expect(
      hasConnectorConflict([makeReservation({ status: 'charging' })], 'cp-1', 'c1', now)
    ).toBe(true);
  });

  it('generates deterministic formatted QR tokens', () => {
    const tokenA = generateQrToken('res-abc-123');
    const tokenB = generateQrToken('res-zzz-999');
    expect(tokenA).toMatch(/^IMC-[A-Z0-9]+-QR$/);
    expect(tokenA).not.toBe(tokenB);
  });
});

describe('billing, commission, anomaly detection, and payouts', () => {
  it('computes private host metered kWh and 80/20 split in INR', () => {
    // 142500 Wh -> 164900 Wh = 22.4 kWh @ ₹18.00/kWh = ₹403.20
    // 20% commission = ₹80.64, 80% Host payout = ₹322.56
    const billing = calculateMeteredBilling(142500, 164900, 18, 0.2);
    expect(billing.energyDeliveredKwh).toBe(22.4);
    expect(billing.grossAmount).toBe(403.2);
    expect(billing.imchargeCommission).toBe(80.64);
    expect(billing.hostPayout).toBe(322.56);

    const zeroBilling = calculateMeteredBilling(142000, 142000, 18);
    expect(zeroBilling.energyDeliveredKwh).toBe(0);
    expect(zeroBilling.hostPayout).toBe(0);
  });

  it('rejects invalid meter readings or negative tariffs', () => {
    expect(() => calculateMeteredBilling(150000, 140000, 18)).toThrow(/lower than start/);
    expect(() => calculateMeteredBilling(142000, 152000, -5)).toThrow(/cannot be negative/);
    expect(() => calculateMeteredBilling(NaN, 152000, 18)).toThrow(/valid numbers/);
  });

  it('calculates 15% company station commission and zero host payout via ImCharge', () => {
    const commission = calculateCompanyCommission(40, 28, 0.15);
    expect(commission.energyDeliveredKwh).toBe(40);
    expect(commission.grossAmount).toBe(1120);
    expect(commission.imchargeCommission).toBe(168);
    expect(commission.hostPayout).toBe(0);
  });

  it('detects negative, zero, >150 kWh, and physical power-ceiling meter anomalies', () => {
    expect(detectMeterAnomaly(10000, 9000, 11, 60).isAnomaly).toBe(true);
    expect(detectMeterAnomaly(10000, 10000, 11, 60).isAnomaly).toBe(true);
    expect(detectMeterAnomaly(0, 200000, 150, 180).isAnomaly).toBe(true);
    // 11 kW charger for 30 min cannot deliver 50 kWh
    expect(detectMeterAnomaly(100000, 150000, 11, 30).isAnomaly).toBe(true);
    // 11 kW charger for 120 min delivering 19.5 kWh is valid
    expect(detectMeterAnomaly(100000, 119500, 11, 120).isAnomaly).toBe(false);
  });

  it('aggregates pending and settled payouts accurately by host filter', () => {
    const samplePayments: PaymentRecord[] = [
      {
        id: 'p-1',
        sessionId: 's-1',
        driverId: 'd-1',
        hostId: 'host-a',
        amount: 500,
        type: 'charge',
        status: 'completed',
        stripeTransactionId: 'pi_1',
        description: 'Driver charge',
        createdAt: '',
      },
      {
        id: 'p-2',
        sessionId: 's-1',
        driverId: 'd-1',
        hostId: 'host-a',
        amount: 322.56,
        type: 'payout',
        status: 'pending',
        stripeTransactionId: 'po_1',
        description: 'Pending payout A',
        createdAt: '',
      },
      {
        id: 'p-3',
        sessionId: 's-2',
        driverId: 'd-1',
        hostId: 'host-b',
        amount: 144.4,
        type: 'payout',
        status: 'pending',
        stripeTransactionId: 'po_2',
        description: 'Pending payout B',
        createdAt: '',
      },
      {
        id: 'p-4',
        sessionId: 's-0',
        driverId: 'd-1',
        hostId: 'host-a',
        amount: 210.25,
        type: 'payout',
        status: 'completed',
        stripeTransactionId: 'po_0',
        description: 'Settled payout A',
        createdAt: '',
      },
    ];

    expect(summarizeHostPayouts(samplePayments, 'all')).toEqual({
      pendingAmountInr: 466.96,
      settledAmountInr: 210.25,
      pendingCount: 2,
      settledCount: 1,
    });

    expect(summarizeHostPayouts(samplePayments, 'host-a')).toEqual({
      pendingAmountInr: 322.56,
      settledAmountInr: 210.25,
      pendingCount: 1,
      settledCount: 1,
    });
  });
});

describe('scoring, backup discovery, and geofence auto-release', () => {
  it('prioritizes nearby available compatible chargers', () => {
    const driverLoc = { lat: 48.137, lon: 11.576 };
    const closeAvailable = makePoint({
      id: 'cp-close',
      location: { lat: 48.14, lon: 11.58 },
      rating: 4.9,
      pricePerKwh: 18,
    });
    const farOccupied = makePoint({
      id: 'cp-far',
      location: { lat: 48.25, lon: 11.7 },
      connectors: [{ id: 'c2', type: 'CHAdeMO', powerKw: 50, status: 'occupied' }],
      pricePerKwh: 32,
      rating: 4.1,
    });

    expect(scoreChargingPoint(closeAvailable, driverLoc, ['Type2'])).toBeGreaterThan(
      scoreChargingPoint(farOccupied, driverLoc, ['Type2'])
    );
  });

  it('findNearestBackupConnector excludes blocked spot and picks compatible nearby bay', () => {
    const driverLoc = { lat: 48.137, lon: 11.576 };
    const blockedPoint = makePoint({
      id: 'cp-blocked',
      location: { lat: 48.1375, lon: 11.5765 },
      name: 'Blocked Spot',
    });
    const incompatibleCloser = makePoint({
      id: 'cp-chademo-only',
      location: { lat: 48.139, lon: 11.577 },
      name: 'CHAdeMO Only',
      connectors: [{ id: 'c1', type: 'CHAdeMO', powerKw: 50, status: 'available' }],
    });
    const compatibleNearby = makePoint({
      id: 'cp-backup-type2',
      location: { lat: 48.148, lon: 11.582 },
      name: 'Nearby Type2 Wallbox',
      connectors: [
        { id: 'c2-busy', type: 'Type2', powerKw: 22, status: 'occupied' },
        { id: 'c2-free', type: 'Type2', powerKw: 11, status: 'available' },
      ],
    });
    const tooFar = makePoint({
      id: 'cp-far-outside',
      location: { lat: 48.26, lon: 11.67 },
      name: 'Garching Outside 5km',
    });

    const suggestion = findNearestBackupConnector(
      [blockedPoint, incompatibleCloser, compatibleNearby, tooFar],
      'cp-blocked',
      driverLoc,
      ['Type2', 'CCS'],
      5
    );
    expect(suggestion).not.toBeNull();
    expect(suggestion?.point.id).toBe('cp-backup-type2');
    expect(suggestion?.connector.id).toBe('c2-free');
    expect(suggestion?.distanceKm).toBeLessThanOrEqual(5);

    expect(
      findNearestBackupConnector([blockedPoint, tooFar], 'cp-blocked', driverLoc, ['Type2'], 5)
    ).toBeNull();
  });

  it('findOutOfRangeReservations flags active holds outside 10 km while preserving charging sessions', () => {
    const cpClose = makePoint({
      id: 'cp-downtown',
      location: { lat: 48.1445, lon: 11.5608 },
      connectors: [{ id: 'c-1', type: 'Type2', powerKw: 22, status: 'reserved' }],
    });
    const holdRes = makeReservation({
      id: 'res-hold',
      chargingPointId: 'cp-downtown',
      status: 'reserved',
    });
    const activeChargingRes = makeReservation({
      id: 'res-charging',
      chargingPointId: 'cp-downtown',
      status: 'charging',
    });

    expect(
      findOutOfRangeReservations(
        [holdRes, activeChargingRes],
        [cpClose],
        'drv-1',
        { lat: 48.137154, lon: 11.576124 },
        10
      )
    ).toHaveLength(0);

    const out = findOutOfRangeReservations(
      [holdRes, activeChargingRes],
      [cpClose],
      'drv-1',
      { lat: 48.3537, lon: 11.775 },
      10
    );
    expect(out).toHaveLength(1);
    expect(out[0].reservation.id).toBe('res-hold');
    expect(out[0].distanceKm).toBeGreaterThan(10);
  });
});

describe('telemetry ticks and walk-in load detection', () => {
  it('advances kWh, meter Wh, and INR cost accurately', () => {
    const initial: LiveTelemetryReading = {
      sessionId: 'ses-1',
      chargingPointId: 'cp-1',
      connectorId: 'c-1',
      livePowerKw: 20,
      deliveredKwh: 0,
      currentMeterWh: 142580,
      estimatedCostInr: 0,
      elapsedSeconds: 0,
      protocol: 'OCPP 2.0.1',
      lastUpdatedAt: '2026-11-23T10:00:00.000Z',
    };

    const next = advanceTelemetryReading(
      initial,
      142580,
      22,
      20,
      6,
      '2026-11-23T10:00:06.000Z',
      30
    );
    expect(next.deliveredKwh).toBe(1);
    expect(next.currentMeterWh).toBe(143580);
    expect(next.estimatedCostInr).toBe(20);
    expect(next.elapsedSeconds).toBe(6);
  });

  it('flags unbooked load > 0.5 kW and ignores active sessions', () => {
    expect(isUnbookedWalkInLoad(7.2, false)).toBe(true);
    expect(isUnbookedWalkInLoad(0.5, false)).toBe(false);
    expect(isUnbookedWalkInLoad(0.2, false)).toBe(false);
    expect(isUnbookedWalkInLoad(22, true)).toBe(false);
  });
});

describe('registration validation', () => {
  const validDriver = {
    name: 'Aarav Mehta',
    email: 'aarav@evmail.in',
    phone: '+91 98201 11223',
    password: 'secret123',
    paymentMethodLabel: 'UPI •••• 9912',
    vehicle: {
      make: 'Tata',
      model: 'Nexon EV Max',
      year: 2025,
      licensePlate: 'MH-01-EV-4021',
      batteryCapacity: 40.5,
      connectorType: ['CCS' as const, 'Type2' as const],
    },
  };

  it('validates EV driver and vehicle inputs', () => {
    expect(validateDriverRegistrationInput(validDriver)).toEqual({ ok: true });
    expect(validateDriverRegistrationInput({ ...validDriver, name: '' }).ok).toBe(false);
    expect(validateDriverRegistrationInput({ ...validDriver, email: 'bad' }).ok).toBe(false);
    expect(validateDriverRegistrationInput({ ...validDriver, password: '12' }).ok).toBe(false);
    expect(
      validateDriverRegistrationInput({
        ...validDriver,
        vehicle: { ...validDriver.vehicle, batteryCapacity: 0 },
      }).ok
    ).toBe(false);
    expect(
      validateDriverRegistrationInput({
        ...validDriver,
        vehicle: { ...validDriver.vehicle, connectorType: [] },
      }).ok
    ).toBe(false);
  });

  it('distinguishes private host meter rules vs partner station rules', () => {
    const validPrivate = validateHostRegistrationInput({
      name: 'Priya Nair',
      email: 'priya.host@imcharge.in',
      phone: '+91 98450 22334',
      password: 'hostpass99',
      chargingPointType: 'private_host',
      bankAccountIban: 'IN89 HDFC 0004 2210 99',
      equipment: {
        brand: 'ABB',
        model: 'Terra AC 22kW',
        powerKw: 22,
        connectorType: ['Type2'],
        meterSerialNumber: 'SM-IN-88412',
      },
      availability: {
        weekdays: '07:00 - 22:00',
        weekends: '08:00 - 23:00',
      },
    });
    expect(validPrivate).toEqual({ ok: true });

    const missingMeter = validateHostRegistrationInput({
      name: 'Priya Nair',
      email: 'priya.host@imcharge.in',
      phone: '+91 98450 22334',
      password: 'hostpass99',
      chargingPointType: 'private_host',
      bankAccountIban: 'IN89 HDFC 0004 2210 99',
      equipment: {
        brand: 'ABB',
        model: 'Terra AC 22kW',
        powerKw: 22,
        connectorType: ['Type2'],
        meterSerialNumber: '',
      },
      availability: {
        weekdays: '07:00 - 22:00',
        weekends: '08:00 - 23:00',
      },
    });
    expect(missingMeter.ok).toBe(false);

    const validPartner = validateHostRegistrationInput({
      name: 'Tata Power EZ Fleet',
      email: 'ops@tatapower-ev.in',
      phone: '+91 22 6717 1000',
      password: 'partnerpass',
      chargingPointType: 'existing_station',
      bankAccountIban: 'IN12 ICIC 0001 8810 44',
      partnerNetwork: 'Tata Power EZ',
      partnerStationId: 'TP-MUC-204',
      availability: {
        weekdays: '24/7',
        weekends: '24/7',
      },
    });
    expect(validPartner).toEqual({ ok: true });
  });
});
