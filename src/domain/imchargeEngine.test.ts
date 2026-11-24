import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROXIMITY_RADIUS_KM,
  advanceTelemetryReading,
  calculateCompanyCommission,
  calculateDistanceKm,
  calculateMeteredBilling,
  canTransitionReservation,
  createHoldWindow,
  detectMeterAnomaly,
  findNearestBackupConnector,
  findOutOfRangeReservations,
  hasConnectorConflict,
  isReservationExpired,
  isUnbookedWalkInLoad,
  isWithinProximityRadius,
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

test('Haversine distance and 10km proximity validation work accurately', () => {
  assert.equal(PROXIMITY_RADIUS_KM, 10);
  const marienplatz = { lat: 48.137154, lon: 11.576124 };
  const schwabing = { lat: 48.1618, lon: 11.5861 };
  const garching = { lat: 48.2489, lon: 11.651 }; // ~13.6 km
  const airport = { lat: 48.3537, lon: 11.775 };

  const distSchwabing = calculateDistanceKm(marienplatz, schwabing);
  assert.ok(distSchwabing > 2.5 && distSchwabing < 3.5);
  assert.equal(isWithinProximityRadius(marienplatz, schwabing), true);
  assert.equal(isWithinProximityRadius(marienplatz, garching), false);
  assert.equal(isWithinProximityRadius(marienplatz, airport), false);
});

test('Reservation state machine enforces valid transitions', () => {
  assert.equal(canTransitionReservation('reserved', 'confirmed'), true);
  assert.equal(canTransitionReservation('reserved', 'charging'), false);
  assert.equal(canTransitionReservation('confirmed', 'charging'), true);
  assert.equal(canTransitionReservation('charging', 'completed'), true);
  assert.equal(canTransitionReservation('charging', 'disputed'), true);
  assert.equal(canTransitionReservation('completed', 'cancelled'), false);
});

test('30-minute hold window expires accurately and prevents double booking', () => {
  const now = Date.parse('2026-11-23T10:00:00.000Z');
  const hold = createHoldWindow(now, 30);
  assert.equal(hold.expiresAt, '2026-11-23T10:30:00.000Z');

  const activeRes: Reservation = {
    id: 'res-1',
    driverId: 'drv-1',
    driverName: 'Elena',
    hostId: 'host-1',
    chargingPointId: 'cp-1',
    chargingPointName: 'Home Wallbox',
    chargingPointType: 'private_host',
    connectorId: 'c-1',
    connectorType: 'Type2',
    powerKw: 11,
    pricePerKwh: 0.3,
    status: 'reserved',
    reservedAt: hold.reservedAt,
    expiresAt: hold.expiresAt,
    qrCodeToken: 'IMC-RES1-QR',
    distanceKm: 1.2,
  };

  assert.equal(isReservationExpired(activeRes, now + 29 * 60 * 1000), false);
  assert.equal(isReservationExpired(activeRes, now + 30 * 60 * 1000), true);

  assert.equal(
    hasConnectorConflict([activeRes], 'cp-1', 'c-1', now + 10 * 60 * 1000),
    true
  );
  assert.equal(
    hasConnectorConflict([activeRes], 'cp-1', 'c-1', now + 31 * 60 * 1000),
    false
  );
});

test('Private host metered billing calculates kWh and 80/20 split in INR', () => {
  // 142500 Wh -> 164900 Wh = 22.4 kWh @ ₹18.00/kWh = ₹403.20
  // 20% ImCharge commission = ₹80.64, 80% Host payout = ₹322.56
  const billing = calculateMeteredBilling(142500, 164900, 18, 0.2);
  assert.equal(billing.energyDeliveredKwh, 22.4);
  assert.equal(billing.grossAmount, 403.2);
  assert.equal(billing.imchargeCommission, 80.64);
  assert.equal(billing.hostPayout, 322.56);

  assert.throws(() => calculateMeteredBilling(150000, 140000, 18), /lower than start/);
});

test('Company station commission calculates 15% split and zero host payout via ImCharge', () => {
  const commission = calculateCompanyCommission(40, 28, 0.15);
  assert.equal(commission.grossAmount, 1120);
  assert.equal(commission.imchargeCommission, 168);
  assert.equal(commission.hostPayout, 0);
});

test('Meter anomaly detection flags negative, zero, and impossible energy deltas', () => {
  assert.equal(detectMeterAnomaly(10000, 9000, 11, 60).isAnomaly, true);
  assert.equal(detectMeterAnomaly(10000, 10000, 11, 60).isAnomaly, true);
  // 11 kW charger for 30 min cannot deliver 50 kWh
  assert.equal(detectMeterAnomaly(100000, 150000, 11, 30).isAnomaly, true);
  // 11 kW charger for 120 min delivering 19.5 kWh is valid
  assert.equal(detectMeterAnomaly(100000, 119500, 11, 120).isAnomaly, false);
});

test('Recommendation scoring prioritizes compatible available nearby chargers', () => {
  const driverLoc = { lat: 48.137, lon: 11.576 };
  const closeCompatible: ChargingPoint = {
    id: 'cp-close',
    hostUid: 'h1',
    hostName: 'Lukas',
    type: 'private_host',
    location: { lat: 48.14, lon: 11.58 },
    address: 'Maximilianstr. 12',
    name: 'Courtyard Wallbox',
    description: '11 kW AC',
    connectors: [{ id: 'c1', type: 'Type2', powerKw: 11, status: 'available' }],
    pricePerKwh: 0.3,
    commissionRate: 0.2,
    rating: 4.9,
    reviewCount: 18,
    photos: [],
    availabilityHours: '08:00-22:00',
    kycVerified: true,
    createdAt: '',
    updatedAt: '',
  };
  const farBusy: ChargingPoint = {
    ...closeCompatible,
    id: 'cp-far',
    location: { lat: 48.25, lon: 11.7 },
    connectors: [{ id: 'c2', type: 'CHAdeMO', powerKw: 50, status: 'occupied' }],
    pricePerKwh: 0.65,
    rating: 4.1,
  };

  assert.ok(
    scoreChargingPoint(closeCompatible, driverLoc, ['Type2']) >
      scoreChargingPoint(farBusy, driverLoc, ['Type2'])
  );
});

test('findNearestBackupConnector excludes blocked point, honors 5km radius, and prioritizes compatible available plugs', () => {
  const driverLoc = { lat: 48.137, lon: 11.576 };
  const blockedPoint: ChargingPoint = {
    id: 'cp-blocked',
    hostUid: 'h0',
    hostName: 'Blocked Host',
    type: 'private_host',
    location: { lat: 48.1375, lon: 11.5765 },
    address: 'Marienplatz 2',
    name: 'Blocked Spot',
    description: '',
    connectors: [{ id: 'c0', type: 'Type2', powerKw: 22, status: 'available' }],
    pricePerKwh: 18,
    commissionRate: 0.2,
    rating: 4.9,
    reviewCount: 10,
    photos: [],
    availabilityHours: '24/7',
    kycVerified: true,
    createdAt: '',
    updatedAt: '',
  };
  const incompatibleCloser: ChargingPoint = {
    ...blockedPoint,
    id: 'cp-chademo-only',
    location: { lat: 48.139, lon: 11.577 },
    name: 'CHAdeMO Only',
    connectors: [{ id: 'c1', type: 'CHAdeMO', powerKw: 50, status: 'available' }],
  };
  const compatibleNearby: ChargingPoint = {
    ...blockedPoint,
    id: 'cp-backup-type2',
    location: { lat: 48.148, lon: 11.582 },
    name: 'Nearby Type2 Wallbox',
    connectors: [
      { id: 'c2-busy', type: 'Type2', powerKw: 22, status: 'occupied' },
      { id: 'c2-free', type: 'Type2', powerKw: 11, status: 'available' },
    ],
  };
  const tooFar: ChargingPoint = {
    ...blockedPoint,
    id: 'cp-far-outside',
    location: { lat: 48.26, lon: 11.67 },
    name: 'Garching Outside 5km',
    connectors: [{ id: 'c3', type: 'Type2', powerKw: 22, status: 'available' }],
  };

  const suggestion = findNearestBackupConnector(
    [blockedPoint, incompatibleCloser, compatibleNearby, tooFar],
    'cp-blocked',
    driverLoc,
    ['Type2', 'CCS'],
    5
  );
  assert.ok(suggestion);
  assert.equal(suggestion.point.id, 'cp-backup-type2');
  assert.equal(suggestion.connector.id, 'c2-free');
  assert.ok(suggestion.distanceKm <= 5);

  const noneAvailable = findNearestBackupConnector(
    [blockedPoint, tooFar],
    'cp-blocked',
    driverLoc,
    ['Type2'],
    5
  );
  assert.equal(noneAvailable, null);
});

test('validateDriverRegistrationInput validates EV owner and vehicle details', () => {
  const valid = validateDriverRegistrationInput({
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
      connectorType: ['CCS', 'Type2'],
    },
  });
  assert.deepEqual(valid, { ok: true });

  const badEmail = validateDriverRegistrationInput({
    name: 'Aarav Mehta',
    email: 'invalid-email',
    phone: '+91 98201 11223',
    password: 'secret123',
    paymentMethodLabel: 'UPI',
    vehicle: {
      make: 'Tata',
      model: 'Nexon EV',
      year: 2025,
      licensePlate: 'MH-01-EV-4021',
      batteryCapacity: 40,
      connectorType: ['CCS'],
    },
  });
  assert.equal(badEmail.ok, false);

  const noConnector = validateDriverRegistrationInput({
    name: 'Aarav Mehta',
    email: 'aarav@evmail.in',
    phone: '+91 98201 11223',
    password: 'secret123',
    paymentMethodLabel: 'UPI',
    vehicle: {
      make: 'Tata',
      model: 'Nexon EV',
      year: 2025,
      licensePlate: 'MH-01-EV-4021',
      batteryCapacity: 40,
      connectorType: [],
    },
  });
  assert.equal(noConnector.ok, false);
});

test('validateHostRegistrationInput distinguishes private host meter rules vs partner station rules', () => {
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
  assert.deepEqual(validPrivate, { ok: true });

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
  assert.equal(missingMeter.ok, false);

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
  assert.deepEqual(validPartner, { ok: true });
});

test('summarizeHostPayouts aggregates pending and settled payout disbursements accurately', () => {
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

  const allHosts = summarizeHostPayouts(samplePayments, 'all');
  assert.deepEqual(allHosts, {
    pendingAmountInr: 466.96,
    settledAmountInr: 210.25,
    pendingCount: 2,
    settledCount: 1,
  });

  const onlyHostA = summarizeHostPayouts(samplePayments, 'host-a');
  assert.deepEqual(onlyHostA, {
    pendingAmountInr: 322.56,
    settledAmountInr: 210.25,
    pendingCount: 1,
    settledCount: 1,
  });
});

test('advanceTelemetryReading advances kWh, meter Wh, and INR cost accurately', () => {
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

  // 20 kW for 180 effective seconds = 1.0 kWh @ ₹20/kWh = ₹20.00
  const next = advanceTelemetryReading(
    initial,
    142580,
    22,
    20,
    6,
    '2026-11-23T10:00:06.000Z',
    30
  );
  assert.equal(next.deliveredKwh, 1);
  assert.equal(next.currentMeterWh, 143580);
  assert.equal(next.estimatedCostInr, 20);
  assert.equal(next.elapsedSeconds, 6);
});

test('isUnbookedWalkInLoad flags unbooked load > 0.5 kW and allows active sessions', () => {
  assert.equal(isUnbookedWalkInLoad(7.2, false), true);
  assert.equal(isUnbookedWalkInLoad(0.2, false), false);
  assert.equal(isUnbookedWalkInLoad(22, true), false);
});

test('findOutOfRangeReservations detects active holds outside 10km geofence while preserving charging sessions', () => {
  const cpClose: ChargingPoint = {
    id: 'cp-downtown',
    hostUid: 'h1',
    hostName: 'Host',
    type: 'private_host',
    location: { lat: 48.1445, lon: 11.5608 },
    address: 'Brienner Str 45',
    name: 'Downtown Wallbox',
    description: '',
    connectors: [{ id: 'c-1', type: 'Type2', powerKw: 22, status: 'reserved' }],
    pricePerKwh: 18,
    commissionRate: 0.2,
    rating: 4.8,
    reviewCount: 2,
    photos: [],
    availabilityHours: '24/7',
    kycVerified: true,
    createdAt: '',
    updatedAt: '',
  };

  const holdRes: Reservation = {
    id: 'res-hold',
    driverId: 'drv-1',
    driverName: 'Elena',
    hostId: 'h1',
    chargingPointId: 'cp-downtown',
    chargingPointName: 'Downtown Wallbox',
    chargingPointType: 'private_host',
    connectorId: 'c-1',
    connectorType: 'Type2',
    powerKw: 22,
    pricePerKwh: 18,
    status: 'reserved',
    reservedAt: '',
    expiresAt: '',
    qrCodeToken: 'IMC-1-QR',
    distanceKm: 1.4,
  };

  const activeChargingRes: Reservation = {
    ...holdRes,
    id: 'res-charging',
    status: 'charging',
  };

  // Within 10 km -> empty
  assert.equal(
    findOutOfRangeReservations(
      [holdRes, activeChargingRes],
      [cpClose],
      'drv-1',
      { lat: 48.137154, lon: 11.576124 },
      10
    ).length,
    0
  );

  // Moved to Munich Airport (~29 km away) -> only 'reserved' hold is flagged
  const out = findOutOfRangeReservations(
    [holdRes, activeChargingRes],
    [cpClose],
    'drv-1',
    { lat: 48.3537, lon: 11.775 },
    10
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].reservation.id, 'res-hold');
  assert.ok(out[0].distanceKm > 10);
});
