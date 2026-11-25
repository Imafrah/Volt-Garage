import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
  generateQrToken,
  hasConnectorConflict,
  isReservationExpired,
  isUnbookedWalkInLoad,
  isWithinProximityRadius,
  round2,
  validateDriverRegistrationInput,
  validateHostRegistrationInput,
} from '../domain/imchargeEngine';
import type {
  AdminAnalytics,
  AuthLoginInput,
  BackupConnectorSuggestion,
  ChargingPoint,
  ChargingSession,
  Connector,
  ConnectorType,
  DriverProfile,
  DriverRegistrationInput,
  GeoPoint,
  HostProfile,
  HostRegistrationInput,
  LiveTelemetryReading,
  OcppTelemetryPayload,
  PartnerIntegration,
  PaymentRecord,
  PlatformSnapshot,
  Reservation,
  Review,
  TelemetryEventRecord,
  TelemetryProtocol,
  Vehicle,
} from '../domain/types';

export const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

const DATA_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), 'imcharge-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'imcharge-db.json');

const DEMO_SALT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const DEMO_PASSWORD_HASH = crypto
  .scryptSync('demo1234', DEMO_SALT, 64)
  .toString('hex');

function makeUniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 4);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}

interface CredentialRecord {
  role: 'driver' | 'host';
  uid: string;
  salt: string;
  hash: string;
}

interface DatabaseState {
  drivers: DriverProfile[];
  hosts: HostProfile[];
  chargingPoints: ChargingPoint[];
  reservations: Reservation[];
  sessions: ChargingSession[];
  payments: PaymentRecord[];
  reviews: Review[];
  partners: PartnerIntegration[];
  credentials?: Record<string, CredentialRecord>;
  liveTelemetry: Record<string, LiveTelemetryReading>;
  telemetryEvents: TelemetryEventRecord[];
  telemetryHeartbeatEnabled: boolean;
  revision?: number;
  resetEpoch?: string;
}

function createInitialSeedState(): DatabaseState {
  const now = Date.now();
  const iso = (offsetMinutes: number) =>
    new Date(now + offsetMinutes * 60 * 1000).toISOString();

  const drivers: DriverProfile[] = [
    {
      uid: 'drv-elena',
      name: 'Elena Weber',
      email: 'elena.weber@imcharge.io',
      phone: '+49 170 4829104',
      rating: 4.9,
      reviewCount: 24,
      defaultLocation: { lat: 48.137154, lon: 11.576124 }, // Munich Marienplatz
      paymentMethodLabel: 'Visa •••• 4821 (Stripe)',
      vehicles: [
        {
          id: 'veh-model3',
          make: 'Tesla',
          model: 'Model 3 Long Range',
          year: 2024,
          licensePlate: 'M-EC 402E',
          batteryCapacity: 75,
          connectorType: ['Type2', 'CCS'],
        },
        {
          id: 'veh-id4',
          make: 'Volkswagen',
          model: 'ID.4 Pro',
          year: 2023,
          licensePlate: 'M-VW 881E',
          batteryCapacity: 77,
          connectorType: ['Type2', 'CCS'],
        },
      ],
    },
    {
      uid: 'drv-markus',
      name: 'Markus Lindner',
      email: 'markus.lindner@imcharge.io',
      phone: '+49 172 8841209',
      rating: 4.8,
      reviewCount: 11,
      defaultLocation: { lat: 48.1412, lon: 11.5794 },
      paymentMethodLabel: 'Mastercard •••• 7734 (Stripe)',
      vehicles: [
        {
          id: 'veh-polestar2',
          make: 'Polestar',
          model: 'Polestar 2 Long Range',
          year: 2024,
          licensePlate: 'M-PS 209E',
          batteryCapacity: 82,
          connectorType: ['Type2', 'CCS'],
        },
      ],
    },
  ];

  const hosts: HostProfile[] = [
    {
      uid: 'host-lukas',
      name: 'Lukas Brenner',
      email: 'lukas.brenner@munich-homes.de',
      phone: '+49 171 9928311',
      chargingPointType: 'private_host',
      kycStatus: 'verified',
      rating: 4.9,
      reviewCount: 19,
      commissionRate: 0.2,
      bankAccountIban: 'DE89 3704 0044 0532 0130 00',
      equipment: {
        brand: 'Easee',
        model: 'Home 22kW',
        powerKw: 22,
        connectorType: ['Type2'],
        meterSerialNumber: 'SM-400-20230501A4',
      },
      availability: {
        weekdays: '07:00 – 22:00',
        weekends: '08:00 – 23:00',
      },
    },
    {
      uid: 'host-studio',
      name: 'Albion Works Studio',
      email: 'ops@albionworks-munich.de',
      phone: '+49 89 41209800',
      chargingPointType: 'private_host',
      kycStatus: 'verified',
      rating: 4.7,
      reviewCount: 14,
      commissionRate: 0.2,
      bankAccountIban: 'DE44 7001 0080 0912 4411 02',
      equipment: {
        brand: 'ABL',
        model: 'eM4 Twin Pedestal',
        powerKw: 22,
        connectorType: ['Type2'],
        meterSerialNumber: 'ABL-992014-M',
      },
      availability: {
        weekdays: '06:30 – 21:00',
        weekends: '09:00 – 20:00',
      },
    },
    {
      uid: 'host-ionity',
      name: 'Ionity GmbH Munich Hub',
      email: 'fleet-ops@ionity.eu',
      phone: '+49 89 21548000',
      chargingPointType: 'existing_station',
      kycStatus: 'verified',
      rating: 4.8,
      reviewCount: 62,
      partnerNetwork: 'Ionity',
      partnerStationId: 'ION-MUC-014',
      commissionRate: 0.15,
      bankAccountIban: 'DE12 5001 0517 5407 3249 31',
      availability: {
        weekdays: '24/7',
        weekends: '24/7',
      },
    },
    {
      uid: 'host-chargepoint',
      name: 'ChargePoint Bavaria Fleet',
      email: 'partner-eu@chargepoint.com',
      phone: '+49 89 90403210',
      chargingPointType: 'existing_station',
      kycStatus: 'verified',
      rating: 4.6,
      reviewCount: 41,
      partnerNetwork: 'ChargePoint',
      partnerStationId: 'CP-BY-902',
      commissionRate: 0.15,
      bankAccountIban: 'DE71 2004 1133 0491 8820 00',
      availability: {
        weekdays: '24/7',
        weekends: '24/7',
      },
    },
  ];

  const chargingPoints: ChargingPoint[] = [
    {
      id: 'cp-schwabing-wallbox',
      hostUid: 'host-lukas',
      hostName: 'Lukas Brenner',
      type: 'private_host',
      location: { lat: 48.1618, lon: 11.5861 }, // ~2.8 km from Marienplatz
      address: 'Leopoldstraße 84, 80802 München',
      name: 'Schwabing Residence Wallbox',
      description:
        'Private covered driveway with MID-certified digital smart meter (SM-400). Step-free access and instant QR arrival check-in.',
      connectors: [
        { id: 'c-sw-1', type: 'Type2', powerKw: 22, status: 'available' },
        { id: 'c-sw-2', type: 'Type2', powerKw: 11, status: 'available' },
      ],
      pricePerKwh: 18,
      commissionRate: 0.2,
      rating: 4.9,
      reviewCount: 2,
      photos: [
        '/src/assets/images/private_home_wallbox_1795443222640.jpg',
        '/src/assets/images/digital_smart_meter_1795443225372.jpg',
      ],
      availabilityHours: '07:00 – 22:00 daily',
      kycVerified: true,
      meterSerialNumber: 'SM-400-20230501A4',
      createdAt: iso(-14400),
      updatedAt: iso(-60),
    },
    {
      id: 'cp-albion-courtyard',
      hostUid: 'host-studio',
      hostName: 'Albion Works Studio',
      type: 'private_host',
      location: { lat: 48.1445, lon: 11.5608 }, // ~1.4 km from Marienplatz
      address: 'Brienner Straße 45, 80333 München',
      name: 'Maxvorstadt Studio Courtyard',
      description:
        'Dedicated EV bay inside gated brick studio courtyard. Ideal for half-day charging while working nearby; cafe on site.',
      connectors: [
        { id: 'c-al-1', type: 'Type2', powerKw: 22, status: 'available' },
        { id: 'c-al-2', type: 'Type1', powerKw: 7.4, status: 'reserved' },
      ],
      pricePerKwh: 20,
      commissionRate: 0.2,
      rating: 4.7,
      reviewCount: 1,
      photos: [
        '/src/assets/images/private_office_charger_1795443224418.jpg',
        '/src/assets/images/digital_smart_meter_1795443225372.jpg',
      ],
      availabilityHours: '06:30 – 21:00 Mon–Sat',
      kycVerified: true,
      meterSerialNumber: 'ABL-992014-M',
      createdAt: iso(-12000),
      updatedAt: iso(-30),
    },
    {
      id: 'cp-ionity-ostbahnhof',
      hostUid: 'host-ionity',
      hostName: 'Ionity GmbH Munich Hub',
      type: 'existing_station',
      partnerName: 'Ionity',
      location: { lat: 48.1274, lon: 11.6047 }, // ~2.4 km from Marienplatz
      address: 'Friedenstraße 18, 81671 München',
      name: 'Ionity Munich East Ultra-Rapid Hub',
      description:
        'Four 350 kW high-power CCS dispensers under timber canopy. Direct partner API sync every 5 minutes; automated start on QR scan.',
      connectors: [
        { id: 'c-io-1', type: 'CCS', powerKw: 350, status: 'available' },
        { id: 'c-io-2', type: 'CCS', powerKw: 350, status: 'occupied' },
        { id: 'c-io-3', type: 'CCS', powerKw: 350, status: 'available' },
        { id: 'c-io-4', type: 'CHAdeMO', powerKw: 50, status: 'available' },
      ],
      pricePerKwh: 28,
      commissionRate: 0.15,
      rating: 4.8,
      reviewCount: 2,
      photos: ['/src/assets/images/company_fast_hub_1795443225006.jpg'],
      availabilityHours: '24/7 Open Access',
      kycVerified: true,
      createdAt: iso(-28800),
      updatedAt: iso(-5),
    },
    {
      id: 'cp-chargepoint-olympia',
      hostUid: 'host-chargepoint',
      hostName: 'ChargePoint Bavaria Fleet',
      type: 'existing_station',
      partnerName: 'ChargePoint',
      location: { lat: 48.1748, lon: 11.5529 }, // ~4.5 km from Marienplatz
      address: 'Spiridon-Louis-Ring 21, 80809 München',
      name: 'ChargePoint Olympiapark Express',
      description:
        'Partner fast-charging plaza adjacent to Olympiapark North entrance. Live occupancy telemetry via ChargePoint OCPP gateway.',
      connectors: [
        { id: 'c-cp-1', type: 'CCS', powerKw: 150, status: 'available' },
        { id: 'c-cp-2', type: 'Type2', powerKw: 22, status: 'available' },
      ],
      pricePerKwh: 24,
      commissionRate: 0.15,
      rating: 4.6,
      reviewCount: 1,
      photos: ['/src/assets/images/company_fast_hub_1795443225006.jpg'],
      availabilityHours: '24/7 Open Access',
      kycVerified: true,
      createdAt: iso(-20000),
      updatedAt: iso(-12),
    },
    {
      id: 'cp-garching-outer',
      hostUid: 'host-ionity',
      hostName: 'Ionity GmbH Munich Hub',
      type: 'existing_station',
      partnerName: 'Ionity',
      location: { lat: 48.2489, lon: 11.651 }, // ~13.6 km from Marienplatz (tests >10 km radius!)
      address: 'Lichtenbergstraße 8, 85748 Garching',
      name: 'Ionity A9 Garching Corridor',
      description:
        'Highway corridor fast-charging park north of Munich ring road. Outside the 10 km downtown booking geofence.',
      connectors: [
        { id: 'c-ga-1', type: 'CCS', powerKw: 350, status: 'available' },
        { id: 'c-ga-2', type: 'CCS', powerKw: 350, status: 'available' },
      ],
      pricePerKwh: 28,
      commissionRate: 0.15,
      rating: 4.7,
      reviewCount: 1,
      photos: ['/src/assets/images/company_fast_hub_1795443225006.jpg'],
      availabilityHours: '24/7 Open Access',
      kycVerified: true,
      createdAt: iso(-25000),
      updatedAt: iso(-15),
    },
  ];

  const holdSeed = createHoldWindow(now - 8 * 60 * 1000, 30);

  const reservations: Reservation[] = [
    {
      id: 'res-seed-active',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      hostId: 'host-studio',
      chargingPointId: 'cp-albion-courtyard',
      chargingPointName: 'Maxvorstadt Studio Courtyard',
      chargingPointType: 'private_host',
      connectorId: 'c-al-2',
      connectorType: 'Type1',
      powerKw: 7.4,
      pricePerKwh: 20,
      status: 'reserved',
      reservedAt: holdSeed.reservedAt,
      expiresAt: holdSeed.expiresAt,
      qrCodeToken: 'IMC-AL2A-QR',
      distanceKm: 1.4,
      notes: 'Arriving in 10 min for 2-hour top-up.',
    },
    {
      id: 'res-seed-completed-1',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      hostId: 'host-lukas',
      chargingPointId: 'cp-schwabing-wallbox',
      chargingPointName: 'Schwabing Residence Wallbox',
      chargingPointType: 'private_host',
      connectorId: 'c-sw-1',
      connectorType: 'Type2',
      powerKw: 22,
      pricePerKwh: 18,
      status: 'completed',
      reservedAt: iso(-260),
      expiresAt: iso(-230),
      confirmedAt: iso(-250),
      startedAt: iso(-248),
      completedAt: iso(-168),
      qrCodeToken: 'IMC-SW19-QR',
      distanceKm: 2.8,
    },
    {
      id: 'res-seed-disputed',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      hostId: 'host-lukas',
      chargingPointId: 'cp-schwabing-wallbox',
      chargingPointName: 'Schwabing Residence Wallbox',
      chargingPointType: 'private_host',
      connectorId: 'c-sw-2',
      connectorType: 'Type2',
      powerKw: 11,
      pricePerKwh: 18,
      status: 'disputed',
      reservedAt: iso(-720),
      expiresAt: iso(-690),
      confirmedAt: iso(-710),
      startedAt: iso(-705),
      completedAt: iso(-645),
      qrCodeToken: 'IMC-DSP2-QR',
      distanceKm: 2.8,
    },
  ];

  const sessions: ChargingSession[] = [
    {
      id: 'ses-seed-1',
      reservationId: 'res-seed-completed-1',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      hostId: 'host-lukas',
      chargingPointId: 'cp-schwabing-wallbox',
      chargingPointName: 'Schwabing Residence Wallbox',
      chargingPointType: 'private_host',
      connectorId: 'c-sw-1',
      pricePerKwh: 18,
      startTime: iso(-248),
      endTime: iso(-168),
      energyDeliveredKwh: 22.4,
      meterReadingStartWh: 120180,
      meterReadingEndWh: 142580,
      meterPhotoStart: '/src/assets/images/digital_smart_meter_1795443225372.jpg',
      meterPhotoEnd: '/src/assets/images/digital_smart_meter_1795443225372.jpg',
      amount: 403.2,
      commission: 80.64,
      hostPayout: 322.56,
      status: 'completed',
    },
    {
      id: 'ses-seed-partner',
      reservationId: 'res-partner-hist',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      hostId: 'host-ionity',
      chargingPointId: 'cp-ionity-ostbahnhof',
      chargingPointName: 'Ionity Munich East Ultra-Rapid Hub',
      chargingPointType: 'existing_station',
      connectorId: 'c-io-1',
      pricePerKwh: 28,
      startTime: iso(-1440),
      endTime: iso(-1405),
      energyDeliveredKwh: 42.0,
      amount: 1176.0,
      commission: 176.4,
      hostPayout: 0,
      status: 'completed',
    },
    {
      id: 'ses-seed-disputed',
      reservationId: 'res-seed-disputed',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      hostId: 'host-lukas',
      chargingPointId: 'cp-schwabing-wallbox',
      chargingPointName: 'Schwabing Residence Wallbox',
      chargingPointType: 'private_host',
      connectorId: 'c-sw-2',
      pricePerKwh: 18,
      startTime: iso(-705),
      endTime: iso(-645),
      energyDeliveredKwh: 48.5,
      meterReadingStartWh: 71680,
      meterReadingEndWh: 120180,
      meterPhotoStart: '/src/assets/images/digital_smart_meter_1795443225372.jpg',
      meterPhotoEnd: '/src/assets/images/digital_smart_meter_1795443225372.jpg',
      amount: 873.0,
      commission: 174.6,
      hostPayout: 698.4,
      status: 'disputed',
      disputeReason:
        'Meter delta (48.50 kWh) exceeds physical 11 kW hardware ceiling for 60-minute session duration.',
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: 'pay-seed-1',
      sessionId: 'ses-seed-1',
      driverId: 'drv-elena',
      hostId: 'host-lukas',
      amount: 403.2,
      type: 'charge',
      status: 'completed',
      stripeTransactionId: 'pi_3Q9xLmImCharge001',
      description: 'Metered session · 22.40 kWh @ ₹18.00/kWh',
      createdAt: iso(-168),
      completedAt: iso(-167),
    },
    {
      id: 'pay-seed-2',
      sessionId: 'ses-seed-1',
      driverId: 'drv-elena',
      hostId: 'host-lukas',
      amount: 322.56,
      type: 'payout',
      status: 'pending',
      stripeTransactionId: 'po_3Q9xLmHost001',
      description: 'Host 80% share pending weekly settlement',
      createdAt: iso(-167),
    },
    {
      id: 'pay-seed-3',
      sessionId: 'ses-seed-partner',
      driverId: 'drv-elena',
      hostId: 'host-ionity',
      amount: 176.4,
      type: 'commission',
      status: 'completed',
      stripeTransactionId: 'inv_Ionity15Pct002',
      description: 'Ionity 15% partner commission (42.00 kWh)',
      createdAt: iso(-1405),
      completedAt: iso(-1404),
    },
  ];

  const reviews: Review[] = [
    {
      id: 'rev-1',
      chargingPointId: 'cp-schwabing-wallbox',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      rating: 5,
      comment:
        'Clean driveway access and exact digital meter readout matched my Tesla telemetry within 0.1 kWh.',
      createdAt: iso(-160),
    },
    {
      id: 'rev-2',
      chargingPointId: 'cp-schwabing-wallbox',
      driverId: 'drv-markus',
      driverName: 'Markus Lindner',
      rating: 5,
      comment: 'Lukas verified QR code immediately and parking bay is spacious.',
      createdAt: iso(-2800),
    },
    {
      id: 'rev-3',
      chargingPointId: 'cp-albion-courtyard',
      driverId: 'drv-sophia',
      driverName: 'Sophia Klein',
      rating: 5,
      comment: 'Quiet courtyard charger right near Odeonsplatz.',
      createdAt: iso(-1900),
    },
    {
      id: 'rev-4',
      chargingPointId: 'cp-ionity-ostbahnhof',
      driverId: 'drv-elena',
      driverName: 'Elena Weber',
      rating: 5,
      comment: 'Hit 245 kW peak on stall 01. Timber canopy kept the rain off.',
      createdAt: iso(-1390),
    },
  ];

  const partners: PartnerIntegration[] = [
    {
      id: 'prt-ionity',
      partnerName: 'Ionity',
      apiEndpoint: 'https://ocpi.ionity.eu/2.2/locations',
      lastSyncTime: iso(-4),
      syncIntervalMinutes: 5,
      status: 'active',
      syncedStationsCount: 2,
      commissionRate: 0.15,
    },
    {
      id: 'prt-chargepoint',
      partnerName: 'ChargePoint',
      apiEndpoint: 'https://api.chargepoint.com/ocpi/v2/stations',
      lastSyncTime: iso(-3),
      syncIntervalMinutes: 5,
      status: 'active',
      syncedStationsCount: 1,
      commissionRate: 0.15,
    },
    {
      id: 'prt-fastned',
      partnerName: 'Fastned',
      apiEndpoint: 'https://api.fastnedcharging.com/v1/hubs',
      lastSyncTime: iso(-18),
      syncIntervalMinutes: 5,
      status: 'error',
      syncedStationsCount: 0,
      commissionRate: 0.15,
    },
  ];

  const telemetryEvents: TelemetryEventRecord[] = [
    {
      id: 'tel-seed-1',
      timestamp: iso(-3),
      chargingPointId: 'cp-schwabing-wallbox',
      chargingPointName: 'Schwabing Residence Wallbox',
      connectorId: 'c-sw-1',
      eventType: 'StatusNotification',
      protocol: 'OCPP 2.0.1',
      powerKw: 0,
      meterWh: 142580,
      status: 'available',
      summary: 'Idle heartbeat verified · MID meter SM-400 synced at 142,580 Wh.',
    },
    {
      id: 'tel-seed-2',
      timestamp: iso(-4),
      chargingPointId: 'cp-ionity-ostbahnhof',
      chargingPointName: 'Ionity Munich East Ultra-Rapid Hub',
      connectorId: 'c-io-1',
      eventType: 'StatusNotification',
      protocol: 'OCPI 2.2',
      powerKw: 0,
      status: 'available',
      summary: 'OCPI 2.2 station status polling active (350 kW DC stall ready).',
    },
  ];

  const credentials: Record<string, CredentialRecord> = {};
  for (const d of drivers) {
    credentials[`driver:${d.email.toLowerCase()}`] = {
      role: 'driver',
      uid: d.uid,
      salt: DEMO_SALT,
      hash: DEMO_PASSWORD_HASH,
    };
  }
  for (const h of hosts) {
    credentials[`host:${h.email.toLowerCase()}`] = {
      role: 'host',
      uid: h.uid,
      salt: DEMO_SALT,
      hash: DEMO_PASSWORD_HASH,
    };
  }

  return {
    drivers,
    hosts,
    chargingPoints,
    reservations,
    sessions,
    payments,
    reviews,
    partners,
    credentials,
    liveTelemetry: {},
    telemetryEvents,
    telemetryHeartbeatEnabled: true,
    revision: 1,
    resetEpoch: makeUniqueId('epoch'),
  };
}

class ImChargeStore {
  private state: DatabaseState;

  constructor() {
    this.state = this.loadFromDisk();
  }

  private ensureSeedCredentials(state: DatabaseState): Record<string, CredentialRecord> {
    const creds: Record<string, CredentialRecord> = { ...(state.credentials || {}) };
    for (const d of state.drivers) {
      const key = `driver:${d.email.toLowerCase()}`;
      if (!creds[key]) {
        creds[key] = {
          role: 'driver',
          uid: d.uid,
          salt: DEMO_SALT,
          hash: DEMO_PASSWORD_HASH,
        };
      }
    }
    for (const h of state.hosts) {
      const key = `host:${h.email.toLowerCase()}`;
      if (!creds[key]) {
        creds[key] = {
          role: 'host',
          uid: h.uid,
          salt: DEMO_SALT,
          hash: DEMO_PASSWORD_HASH,
        };
      }
    }
    return creds;
  }

  private loadFromDisk(): DatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<DatabaseState>;
        if (parsed && Array.isArray(parsed.chargingPoints)) {
          const loaded: DatabaseState = {
            ...(parsed as DatabaseState),
            liveTelemetry: parsed.liveTelemetry || {},
            telemetryEvents: Array.isArray(parsed.telemetryEvents)
              ? parsed.telemetryEvents
              : [],
            telemetryHeartbeatEnabled:
              parsed.telemetryHeartbeatEnabled !== false,
            revision:
              typeof parsed.revision === 'number' && parsed.revision >= 1
                ? parsed.revision
                : 1,
            resetEpoch: parsed.resetEpoch || makeUniqueId('epoch'),
          };
          loaded.credentials = this.ensureSeedCredentials(loaded);
          return loaded;
        }
      }
    } catch {
      // Fallback to seed state if file is unreadable
    }
    const seed = createInitialSeedState();
    this.saveToDisk(seed);
    return seed;
  }

  private bumpRevision(): void {
    this.state.revision = (this.state.revision ?? 1) + 1;
  }

  private saveToDisk(state: DatabaseState = this.state): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // Non-fatal in read-only environments
    }
  }

  public expireStaleReservations(nowMs: number = Date.now()): number {
    let expiredCount = 0;
    for (const res of this.state.reservations) {
      if (isReservationExpired(res, nowMs)) {
        res.status = 'cancelled';
        res.notes = 'Auto-cancelled after 30-minute hold window expired.';
        this.setConnectorStatus(res.chargingPointId, res.connectorId, 'available');
        expiredCount++;
      }
    }
    if (expiredCount > 0) {
      this.bumpRevision();
      this.saveToDisk();
    }
    return expiredCount;
  }

  private setConnectorStatus(
    chargingPointId: string,
    connectorId: string,
    status: Connector['status']
  ): void {
    const cp = this.state.chargingPoints.find((p) => p.id === chargingPointId);
    if (!cp) return;
    const conn = cp.connectors.find((c) => c.id === connectorId);
    if (conn) {
      conn.status = status;
      cp.updatedAt = new Date().toISOString();
    }
  }

  public getAnalytics(): AdminAnalytics {
    const totalBookings = this.state.reservations.length;
    const activeSessions = this.state.sessions.filter(
      (s) => s.status === 'in_progress'
    ).length;
    const completedSessionsList = this.state.sessions.filter(
      (s) => s.status === 'completed'
    );
    const disputedSessions = this.state.sessions.filter(
      (s) => s.status === 'disputed'
    ).length;

    const grossVolumeInr = round2(
      completedSessionsList.reduce((sum, s) => sum + s.amount, 0)
    );
    const netCommissionInr = round2(
      completedSessionsList.reduce((sum, s) => sum + s.commission, 0)
    );
    const hostPayoutsInr = round2(
      completedSessionsList.reduce((sum, s) => sum + s.hostPayout, 0)
    );

    const finishedOrDisputed = completedSessionsList.length + disputedSessions;
    const completionRatePct =
      finishedOrDisputed > 0
        ? round2((completedSessionsList.length / finishedOrDisputed) * 100)
        : 100;
    const disputeRatePct =
      finishedOrDisputed > 0
        ? round2((disputedSessions / finishedOrDisputed) * 100)
        : 0;

    return {
      totalBookings,
      activeSessions,
      completedSessions: completedSessionsList.length,
      disputedSessions,
      grossVolumeInr,
      netCommissionInr,
      hostPayoutsInr,
      completionRatePct,
      disputeRatePct,
      activeDriversCount: this.state.drivers.length,
      activeHostsCount: this.state.hosts.length,
    };
  }

  public getSnapshot(): PlatformSnapshot {
    this.expireStaleReservations();
    this.releaseAllOutOfRangeReservations();
    return {
      drivers: this.state.drivers,
      hosts: this.state.hosts,
      chargingPoints: this.state.chargingPoints,
      reservations: this.state.reservations,
      sessions: this.state.sessions,
      payments: this.state.payments,
      reviews: this.state.reviews,
      partners: this.state.partners,
      analytics: this.getAnalytics(),
      liveTelemetry: this.state.liveTelemetry,
      telemetryEvents: this.state.telemetryEvents,
      telemetryHeartbeatEnabled: this.state.telemetryHeartbeatEnabled,
      revision: this.state.revision ?? 1,
      resetEpoch: this.state.resetEpoch,
      serverMode: IS_SERVERLESS ? 'serverless' : 'stateful',
    };
  }

  /**
   * Synchronizes a stateless/cold serverless instance with a newer client snapshot
   * so multi-container Vercel requests never reject reservations or confirmations.
   */
  public reconcileClientState(incoming?: Partial<PlatformSnapshot> | null): boolean {
    if (!incoming || typeof incoming.revision !== 'number') {
      return false;
    }
    if (
      !Array.isArray(incoming.drivers) ||
      !Array.isArray(incoming.hosts) ||
      !Array.isArray(incoming.chargingPoints) ||
      !Array.isArray(incoming.reservations) ||
      !Array.isArray(incoming.sessions) ||
      !Array.isArray(incoming.payments) ||
      !Array.isArray(incoming.reviews) ||
      !Array.isArray(incoming.partners)
    ) {
      return false;
    }

    const currentRev = this.state.revision ?? 1;
    const sameEpochNewer =
      Boolean(incoming.resetEpoch) &&
      incoming.resetEpoch === this.state.resetEpoch &&
      incoming.revision > currentRev;
    const coldContainerHydration =
      currentRev <= 1 && incoming.revision > 1;

    if (!sameEpochNewer && !coldContainerHydration) {
      return false;
    }

    const nextState: DatabaseState = {
      drivers: incoming.drivers,
      hosts: incoming.hosts,
      chargingPoints: incoming.chargingPoints,
      reservations: incoming.reservations,
      sessions: incoming.sessions,
      payments: incoming.payments,
      reviews: incoming.reviews,
      partners: incoming.partners,
      credentials: this.ensureSeedCredentials({
        ...(this.state),
        drivers: incoming.drivers,
        hosts: incoming.hosts,
      }),
      liveTelemetry: incoming.liveTelemetry || {},
      telemetryEvents: Array.isArray(incoming.telemetryEvents)
        ? incoming.telemetryEvents
        : [],
      telemetryHeartbeatEnabled:
        incoming.telemetryHeartbeatEnabled !== false,
      revision: incoming.revision,
      resetEpoch: incoming.resetEpoch || this.state.resetEpoch,
    };

    this.state = nextState;
    this.saveToDisk();
    return true;
  }

  private releaseAllOutOfRangeReservations(): number {
    let total = 0;
    for (const driver of this.state.drivers) {
      const released = this.releaseOutOfRangeReservationsForDriver(
        driver.uid,
        driver.defaultLocation
      );
      total += released.length;
    }
    if (total > 0) {
      this.bumpRevision();
      this.saveToDisk();
    }
    return total;
  }

  public releaseOutOfRangeReservationsForDriver(
    driverId: string,
    driverLocation: GeoPoint
  ): Reservation[] {
    const outOfRange = findOutOfRangeReservations(
      this.state.reservations,
      this.state.chargingPoints,
      driverId,
      driverLocation,
      PROXIMITY_RADIUS_KM
    );
    if (outOfRange.length === 0) return [];

    const nowIso = new Date().toISOString();
    const released: Reservation[] = [];

    for (const { reservation, distanceKm } of outOfRange) {
      reservation.status = 'cancelled';
      reservation.notes = `Auto-unreserved: driver moved ${distanceKm} km away (outside ${PROXIMITY_RADIUS_KM} km geofence). Connector released for other drivers.`;
      this.setConnectorStatus(
        reservation.chargingPointId,
        reservation.connectorId,
        'available'
      );
      this.pushTelemetryEvent({
        id: `tel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: nowIso,
        chargingPointId: reservation.chargingPointId,
        chargingPointName: reservation.chargingPointName,
        connectorId: reservation.connectorId,
        eventType: 'StatusNotification',
        protocol:
          reservation.chargingPointType === 'private_host'
            ? 'OCPP 2.0.1'
            : 'OCPI 2.2',
        powerKw: 0,
        status: 'available',
        summary: `Geofence auto-unreserve: ${reservation.chargingPointName} (${reservation.connectorId}) released because ${reservation.driverName} moved ${distanceKm} km away (>${PROXIMITY_RADIUS_KM} km).`,
      });
      released.push(reservation);
    }

    return released;
  }

  public updateDriverLocation(
    driverId: string,
    location: GeoPoint
  ): { driver: DriverProfile; autoReleasedReservations: Reservation[] } {
    const driver = this.state.drivers.find((d) => d.uid === driverId);
    if (!driver) throw new Error('Driver not found.');
    if (
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lon) ||
      location.lat < -90 ||
      location.lat > 90 ||
      location.lon < -180 ||
      location.lon > 180
    ) {
      throw new Error('Invalid GPS coordinates.');
    }

    driver.defaultLocation = {
      lat: Number(location.lat.toFixed(6)),
      lon: Number(location.lon.toFixed(6)),
    };
    const autoReleasedReservations = this.releaseOutOfRangeReservationsForDriver(
      driver.uid,
      driver.defaultLocation
    );
    this.bumpRevision();
    this.saveToDisk();
    return { driver, autoReleasedReservations };
  }

  private pushTelemetryEvent(event: TelemetryEventRecord): void {
    this.state.telemetryEvents = [
      event,
      ...(this.state.telemetryEvents || []),
    ].slice(0, 25);
  }

  private hashPassword(password: string): { salt: string; hash: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
  }

  private verifyPassword(password: string, salt: string, storedHash: string): boolean {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(storedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }

  public authenticate(input: AuthLoginInput): {
    role: 'driver' | 'host';
    driver?: DriverProfile;
    host?: HostProfile;
  } {
    const emailKey = input.email?.trim().toLowerCase();
    const password = input.password || '';
    if (!emailKey || !password) {
      throw new Error('Email and password are required.');
    }

    this.state.credentials = this.ensureSeedCredentials(this.state);
    const credKey = `${input.role}:${emailKey}`;
    const cred = this.state.credentials[credKey];

    if (cred) {
      if (!this.verifyPassword(password, cred.salt, cred.hash)) {
        throw new Error('Invalid email or password.');
      }
      if (input.role === 'driver') {
        const driver = this.state.drivers.find((d) => d.uid === cred.uid);
        if (!driver) throw new Error('Driver account not found.');
        return { role: 'driver', driver };
      }
      const host = this.state.hosts.find((h) => h.uid === cred.uid);
      if (!host) throw new Error('Host account not found.');
      return { role: 'host', host };
    }

    // Fallback for newly created driver/host hydrated across serverless containers
    if (input.role === 'driver') {
      const driver = this.state.drivers.find(
        (d) => d.email.toLowerCase() === emailKey
      );
      if (driver && password.length >= 6) {
        const { salt, hash } = this.hashPassword(password);
        this.state.credentials[credKey] = {
          role: 'driver',
          uid: driver.uid,
          salt,
          hash,
        };
        return { role: 'driver', driver };
      }
    } else {
      const host = this.state.hosts.find(
        (h) => h.email.toLowerCase() === emailKey
      );
      if (host && password.length >= 6) {
        const { salt, hash } = this.hashPassword(password);
        this.state.credentials[credKey] = {
          role: 'host',
          uid: host.uid,
          salt,
          hash,
        };
        return { role: 'host', host };
      }
    }

    throw new Error('No matching account found for this role and email.');
  }

  public registerDriver(input: DriverRegistrationInput): DriverProfile {
    const validation = validateDriverRegistrationInput(input);
    if (!validation.ok) {
      throw new Error('error' in validation && validation.error ? validation.error : 'Invalid driver registration');
    }

    const emailKey = input.email.trim().toLowerCase();
    if (this.state.drivers.some((d) => d.email.toLowerCase() === emailKey)) {
      throw new Error('An EV Vehicle Owner account with this email already exists.');
    }

    const uid = makeUniqueId('drv');
    const vehicle: Vehicle = {
      id: makeUniqueId('veh'),
      make: input.vehicle.make.trim(),
      model: input.vehicle.model.trim(),
      year: Number(input.vehicle.year) || new Date().getFullYear(),
      licensePlate: input.vehicle.licensePlate.trim().toUpperCase(),
      batteryCapacity: Number(input.vehicle.batteryCapacity),
      connectorType: input.vehicle.connectorType,
    };

    const driver: DriverProfile = {
      uid,
      name: input.name.trim(),
      email: emailKey,
      phone: input.phone.trim(),
      rating: 5.0,
      reviewCount: 0,
      defaultLocation: { lat: 48.137154, lon: 11.576124 },
      paymentMethodLabel: input.paymentMethodLabel.trim(),
      vehicles: [vehicle],
    };

    const { salt, hash } = this.hashPassword(input.password);
    this.state.credentials = this.state.credentials || {};
    this.state.credentials[`driver:${emailKey}`] = {
      role: 'driver',
      uid,
      salt,
      hash,
    };

    this.state.drivers.push(driver);
    this.bumpRevision();
    this.saveToDisk();
    return driver;
  }

  public registerHost(input: HostRegistrationInput): HostProfile {
    const validation = validateHostRegistrationInput(input);
    if (!validation.ok) {
      throw new Error('error' in validation && validation.error ? validation.error : 'Invalid host registration');
    }

    const emailKey = input.email.trim().toLowerCase();
    if (this.state.hosts.some((h) => h.email.toLowerCase() === emailKey)) {
      throw new Error('A Charging Host account with this email already exists.');
    }

    const uid = makeUniqueId('host');
    const isPrivate = input.chargingPointType === 'private_host';
    const host: HostProfile = {
      uid,
      name: input.name.trim(),
      email: emailKey,
      phone: input.phone.trim(),
      chargingPointType: input.chargingPointType,
      kycStatus: 'verified',
      rating: 5.0,
      reviewCount: 0,
      partnerNetwork: !isPrivate ? input.partnerNetwork?.trim() : undefined,
      partnerStationId: !isPrivate ? input.partnerStationId?.trim() : undefined,
      commissionRate: isPrivate ? 0.2 : 0.15,
      bankAccountIban: input.bankAccountIban.trim().toUpperCase(),
      equipment:
        isPrivate && input.equipment
          ? {
              brand: input.equipment.brand.trim(),
              model: input.equipment.model.trim(),
              powerKw: Number(input.equipment.powerKw),
              connectorType: input.equipment.connectorType,
              meterSerialNumber: input.equipment.meterSerialNumber.trim().toUpperCase(),
            }
          : undefined,
      availability: {
        weekdays: input.availability.weekdays.trim(),
        weekends: input.availability.weekends.trim(),
      },
    };

    const { salt, hash } = this.hashPassword(input.password);
    this.state.credentials = this.state.credentials || {};
    this.state.credentials[`host:${emailKey}`] = {
      role: 'host',
      uid,
      salt,
      hash,
    };

    this.state.hosts.push(host);
    this.bumpRevision();
    this.saveToDisk();
    return host;
  }

  public addVehicle(
    driverId: string,
    input: Omit<Vehicle, 'id'>
  ): Vehicle {
    const driver = this.state.drivers.find((d) => d.uid === driverId);
    if (!driver) {
      throw new Error('Driver profile not found.');
    }
    const vehicle: Vehicle = {
      id: makeUniqueId('veh'),
      ...input,
    };
    driver.vehicles.unshift(vehicle);
    this.bumpRevision();
    this.saveToDisk();
    return vehicle;
  }

  public createChargingPoint(input: {
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
  }): ChargingPoint {
    const nowIso = new Date().toISOString();
    const hostUid = input.hostUid || makeUniqueId('host');
    const existingHost = this.state.hosts.find((h) => h.uid === hostUid);
    if (!existingHost) {
      this.state.hosts.push({
        uid: hostUid,
        name: input.hostName,
        email: `${input.hostName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@imcharge.io`,
        phone: '+49 89 5550192',
        chargingPointType: input.type,
        kycStatus: 'verified',
        rating: 5.0,
        reviewCount: 0,
        partnerNetwork: input.partnerName,
        partnerStationId: input.partnerStationId,
        commissionRate: input.type === 'private_host' ? 0.2 : 0.15,
        bankAccountIban: 'DE27 1007 7777 0209 2997 00',
        equipment:
          input.type === 'private_host'
            ? {
                brand: 'ImCharge Certified',
                model: `${input.powerKw}kW Wallbox`,
                powerKw: input.powerKw,
                connectorType: [input.connectorType],
                meterSerialNumber: input.meterSerialNumber || 'SM-9901-NEW',
              }
            : undefined,
        availability: {
          weekdays: input.availabilityHours,
          weekends: input.availabilityHours,
        },
      });
    }

    const cpId = makeUniqueId('cp');
    const photo =
      input.type === 'private_host'
        ? '/src/assets/images/private_home_wallbox_1795443222640.jpg'
        : '/src/assets/images/company_fast_hub_1795443225006.jpg';

    const newCp: ChargingPoint = {
      id: cpId,
      hostUid,
      hostName: input.hostName,
      type: input.type,
      partnerName: input.partnerName,
      location: { lat: input.lat, lon: input.lon },
      address: input.address,
      name: input.name,
      description: input.description,
      connectors: [
        {
          id: makeUniqueId('c'),
          type: input.connectorType,
          powerKw: input.powerKw,
          status: 'available',
        },
      ],
      pricePerKwh: round2(input.pricePerKwh),
      commissionRate: input.type === 'private_host' ? 0.2 : 0.15,
      rating: 5.0,
      reviewCount: 0,
      photos: [photo],
      availabilityHours: input.availabilityHours,
      kycVerified: true,
      meterSerialNumber: input.meterSerialNumber,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.state.chargingPoints.unshift(newCp);
    this.bumpRevision();
    this.saveToDisk();
    return newCp;
  }

  public createReservation(input: {
    driverId: string;
    chargingPointId: string;
    connectorId: string;
    driverLocation?: GeoPoint;
    enforceProximity?: boolean;
    notes?: string;
  }): Reservation {
    const nowMs = Date.now();
    this.expireStaleReservations(nowMs);

    const driver = this.state.drivers.find((d) => d.uid === input.driverId);
    if (!driver) throw new Error('Driver not found.');

    const cp = this.state.chargingPoints.find(
      (p) => p.id === input.chargingPointId
    );
    if (!cp) throw new Error('Charging point not found.');

    const connector = cp.connectors.find((c) => c.id === input.connectorId);
    if (!connector) throw new Error('Connector not found.');

    if (
      connector.status !== 'available' ||
      hasConnectorConflict(this.state.reservations, cp.id, connector.id, nowMs)
    ) {
      throw new Error('This connector is already reserved or occupied.');
    }

    const origin = input.driverLocation || driver.defaultLocation;
    driver.defaultLocation = origin;
    this.releaseOutOfRangeReservationsForDriver(driver.uid, origin);

    const distanceKm = calculateDistanceKm(origin, cp.location);

    if (
      input.enforceProximity !== false &&
      !isWithinProximityRadius(origin, cp.location, PROXIMITY_RADIUS_KM)
    ) {
      throw new Error(
        `Charging point is ${distanceKm} km away, outside the ${PROXIMITY_RADIUS_KM} km booking geofence.`
      );
    }

    const resId = makeUniqueId('res');
    const hold = createHoldWindow(nowMs, 30);

    const reservation: Reservation = {
      id: resId,
      driverId: driver.uid,
      driverName: driver.name,
      hostId: cp.hostUid,
      chargingPointId: cp.id,
      chargingPointName: cp.name,
      chargingPointType: cp.type,
      connectorId: connector.id,
      connectorType: connector.type,
      powerKw: connector.powerKw,
      pricePerKwh: cp.pricePerKwh,
      status: 'reserved',
      reservedAt: hold.reservedAt,
      expiresAt: hold.expiresAt,
      qrCodeToken: generateQrToken(resId),
      distanceKm,
      notes: input.notes,
    };

    this.state.reservations.unshift(reservation);
    this.setConnectorStatus(cp.id, connector.id, 'reserved');
    this.bumpRevision();
    this.saveToDisk();
    return reservation;
  }

  public confirmReservation(resId: string, qrTokenOrConnector: string): Reservation {
    const res = this.state.reservations.find((r) => r.id === resId);
    if (!res) throw new Error('Reservation not found.');

    if (isReservationExpired(res, Date.now())) {
      this.expireStaleReservations();
      throw new Error('Reservation 30-minute hold has expired.');
    }

    if (!canTransitionReservation(res.status, 'confirmed')) {
      throw new Error(`Cannot confirm reservation in "${res.status}" state.`);
    }

    const normalized = qrTokenOrConnector.trim().toUpperCase();
    const matchesQr = normalized === res.qrCodeToken.toUpperCase();
    const matchesConnector = normalized === res.connectorId.toUpperCase();
    if (!matchesQr && !matchesConnector) {
      throw new Error(
        `Invalid QR token or connector ID. Expected ${res.qrCodeToken} or ${res.connectorId}.`
      );
    }

    res.status = 'confirmed';
    res.confirmedAt = new Date().toISOString();
    this.bumpRevision();
    this.saveToDisk();
    return res;
  }

  public cancelReservation(resId: string): Reservation {
    const res = this.state.reservations.find((r) => r.id === resId);
    if (!res) throw new Error('Reservation not found.');

    if (!canTransitionReservation(res.status, 'cancelled')) {
      throw new Error(`Cannot cancel reservation in "${res.status}" state.`);
    }

    res.status = 'cancelled';
    this.setConnectorStatus(res.chargingPointId, res.connectorId, 'available');
    this.bumpRevision();
    this.saveToDisk();
    return res;
  }

  public updateConnectorStatus(
    pointId: string,
    connectorId: string,
    status: 'available' | 'occupied' | 'maintenance',
    reason?: string
  ): { point: ChargingPoint; cancelledReservationIds: string[] } {
    const cp = this.state.chargingPoints.find((p) => p.id === pointId);
    if (!cp) throw new Error('Charging point not found.');
    const conn = cp.connectors.find((c) => c.id === connectorId);
    if (!conn) throw new Error('Connector not found.');

    const hasLiveSession = this.state.sessions.some(
      (s) =>
        s.chargingPointId === pointId &&
        s.connectorId === connectorId &&
        s.status === 'in_progress'
    );
    if (hasLiveSession) {
      throw new Error(
        'Cannot manually change connector status while an active ImCharge session is running.'
      );
    }

    const cancelledReservationIds: string[] = [];
    if (status === 'occupied' || status === 'maintenance') {
      for (const res of this.state.reservations) {
        if (
          res.chargingPointId === pointId &&
          res.connectorId === connectorId &&
          (res.status === 'reserved' || res.status === 'confirmed')
        ) {
          res.status = 'cancelled';
          res.notes =
            reason?.trim() ||
            (status === 'occupied'
              ? 'Auto-cancelled: connector occupied by walk-in / telemetry.'
              : 'Auto-cancelled: connector placed in maintenance.');
          cancelledReservationIds.push(res.id);
        }
      }
    }

    conn.status = status;
    cp.updatedAt = new Date().toISOString();
    this.bumpRevision();
    this.saveToDisk();
    return { point: cp, cancelledReservationIds };
  }

  public reportBlockedBay(resId: string): {
    reservation: Reservation;
    backupSuggestion: BackupConnectorSuggestion | null;
  } {
    const res = this.state.reservations.find((r) => r.id === resId);
    if (!res) throw new Error('Reservation not found.');
    if (res.status !== 'reserved') {
      throw new Error(
        `Blocked-bay fallback only applies to unconfirmed holds (currently "${res.status}").`
      );
    }

    res.status = 'cancelled';
    res.notes =
      'Cancelled (no penalty): Bay physically blocked by unbooked vehicle on arrival.';
    this.setConnectorStatus(res.chargingPointId, res.connectorId, 'occupied');

    const driver = this.state.drivers.find((d) => d.uid === res.driverId);
    const driverLoc = driver?.defaultLocation || { lat: 48.137154, lon: 11.576124 };
    const preferredConnectors =
      driver?.vehicles[0]?.connectorType ?? [res.connectorType];

    const backupSuggestion = findNearestBackupConnector(
      this.state.chargingPoints,
      res.chargingPointId,
      driverLoc,
      preferredConnectors,
      5
    );

    this.bumpRevision();
    this.saveToDisk();
    return { reservation: res, backupSuggestion };
  }

  public startChargingSession(input: {
    reservationId: string;
    meterReadingStartWh?: number;
  }): ChargingSession {
    const res = this.state.reservations.find((r) => r.id === input.reservationId);
    if (!res) throw new Error('Reservation not found.');

    if (!canTransitionReservation(res.status, 'charging')) {
      throw new Error(`Reservation must be confirmed before charging (currently "${res.status}").`);
    }

    if (res.chargingPointType === 'private_host') {
      if (
        input.meterReadingStartWh === undefined ||
        !Number.isFinite(input.meterReadingStartWh) ||
        input.meterReadingStartWh < 0
      ) {
        throw new Error('Private host sessions require a valid starting meter reading (Wh).');
      }
    }

    const nowIso = new Date().toISOString();
    res.status = 'charging';
    res.startedAt = nowIso;
    this.setConnectorStatus(res.chargingPointId, res.connectorId, 'occupied');

    const session: ChargingSession = {
      id: makeUniqueId('ses'),
      reservationId: res.id,
      driverId: res.driverId,
      driverName: res.driverName,
      hostId: res.hostId,
      chargingPointId: res.chargingPointId,
      chargingPointName: res.chargingPointName,
      chargingPointType: res.chargingPointType,
      connectorId: res.connectorId,
      pricePerKwh: res.pricePerKwh,
      startTime: nowIso,
      energyDeliveredKwh: 0,
      meterReadingStartWh:
        res.chargingPointType === 'private_host'
          ? input.meterReadingStartWh
          : undefined,
      meterPhotoStart:
        res.chargingPointType === 'private_host'
          ? '/src/assets/images/digital_smart_meter_1795443225372.jpg'
          : undefined,
      amount: 0,
      commission: 0,
      hostPayout: 0,
      status: 'in_progress',
    };

    const protocol: TelemetryProtocol =
      res.chargingPointType === 'private_host' ? 'OCPP 2.0.1' : 'OCPI 2.2';
    const startMeterWh = session.meterReadingStartWh ?? 0;
    const initialPowerKw = round2(Math.max(1, (res.powerKw || 22) * 0.92));

    this.state.liveTelemetry[session.id] = {
      sessionId: session.id,
      chargingPointId: res.chargingPointId,
      connectorId: res.connectorId,
      livePowerKw: initialPowerKw,
      deliveredKwh: 0,
      currentMeterWh: startMeterWh,
      estimatedCostInr: 0,
      elapsedSeconds: 0,
      protocol,
      lastUpdatedAt: nowIso,
    };

    this.pushTelemetryEvent({
      id: makeUniqueId('tel'),
      timestamp: nowIso,
      chargingPointId: res.chargingPointId,
      chargingPointName: res.chargingPointName,
      connectorId: res.connectorId,
      eventType: 'StatusNotification',
      protocol,
      powerKw: initialPowerKw,
      meterWh: res.chargingPointType === 'private_host' ? startMeterWh : undefined,
      status: 'occupied',
      summary: `Session ${session.id} started · delivering ${initialPowerKw.toFixed(1)} kW (${protocol}).`,
    });

    this.state.sessions.unshift(session);
    this.bumpRevision();
    this.saveToDisk();
    return session;
  }

  public endChargingSession(
    sessionId: string,
    input: {
      meterReadingEndWh?: number;
      partnerEnergyKwh?: number;
      flagDispute?: boolean;
      disputeReason?: string;
    }
  ): ChargingSession {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Charging session not found.');
    if (session.status !== 'in_progress') {
      throw new Error(`Session is already "${session.status}".`);
    }

    const res = this.state.reservations.find((r) => r.id === session.reservationId);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const durationMin = Math.max(
      1,
      Math.round((nowMs - Date.parse(session.startTime)) / 60000)
    );

    if (session.chargingPointType === 'private_host') {
      const startWh = session.meterReadingStartWh ?? 0;
      const endWh = input.meterReadingEndWh;
      if (endWh === undefined || !Number.isFinite(endWh)) {
        throw new Error('Ending meter reading (Wh) is required to complete a private host session.');
      }

      if (endWh < startWh) {
        throw new Error('End meter reading cannot be lower than start meter reading.');
      }

      const billing = calculateMeteredBilling(
        startWh,
        endWh,
        session.pricePerKwh,
        0.2
      );

      const anomaly = detectMeterAnomaly(
        startWh,
        endWh,
        res?.powerKw ?? 22,
        durationMin
      );

      session.endTime = nowIso;
      session.meterReadingEndWh = endWh;
      session.meterPhotoEnd =
        '/src/assets/images/digital_smart_meter_1795443225372.jpg';
      session.energyDeliveredKwh = billing.energyDeliveredKwh;
      session.amount = billing.grossAmount;
      session.commission = billing.imchargeCommission;
      session.hostPayout = billing.hostPayout;

      if (input.flagDispute || anomaly.isAnomaly) {
        session.status = 'disputed';
        session.disputeReason =
          input.disputeReason || anomaly.reason || 'Meter reading flagged for admin review.';
        if (res) {
          res.status = 'disputed';
          res.completedAt = nowIso;
        }
        delete this.state.liveTelemetry[session.id];
        this.pushTelemetryEvent({
          id: `tel-${Date.now().toString(36)}`,
          timestamp: nowIso,
          chargingPointId: session.chargingPointId,
          chargingPointName: session.chargingPointName,
          connectorId: session.connectorId,
          eventType: 'StatusNotification',
          protocol: 'OCPP 2.0.1',
          powerKw: 0,
          meterWh: endWh,
          status: 'available',
          summary: `Session ${session.id} ended under meter review · connector returned to available.`,
        });
        this.setConnectorStatus(session.chargingPointId, session.connectorId, 'available');
        this.bumpRevision();
        this.saveToDisk();
        return session;
      }

      session.status = 'completed';
      if (res) {
        res.status = 'completed';
        res.completedAt = nowIso;
      }

      this.state.payments.unshift(
        {
          id: `pay-${Date.now().toString(36)}-chg`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.grossAmount,
          type: 'charge',
          status: 'completed',
          stripeTransactionId: `pi_${Date.now().toString(36)}`,
          description: `Metered session · ${billing.energyDeliveredKwh.toFixed(2)} kWh @ ₹${session.pricePerKwh.toFixed(2)}/kWh`,
          createdAt: nowIso,
          completedAt: nowIso,
        },
        {
          id: `pay-${Date.now().toString(36)}-po`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.hostPayout,
          type: 'payout',
          status: 'pending',
          stripeTransactionId: `po_${Date.now().toString(36)}`,
          description: `Host 80% share pending weekly payout`,
          createdAt: nowIso,
        }
      );
    } else {
      const kwh = input.partnerEnergyKwh ?? 28.5;
      const commission = calculateCompanyCommission(kwh, session.pricePerKwh, 0.15);
      session.endTime = nowIso;
      session.energyDeliveredKwh = commission.energyDeliveredKwh;
      session.amount = commission.grossAmount;
      session.commission = commission.imchargeCommission;
      session.hostPayout = 0;
      session.status = 'completed';

      if (res) {
        res.status = 'completed';
        res.completedAt = nowIso;
      }

      this.state.payments.unshift({
        id: `pay-${Date.now().toString(36)}-com`,
        sessionId: session.id,
        driverId: session.driverId,
        hostId: session.hostId,
        amount: commission.imchargeCommission,
        type: 'commission',
        status: 'completed',
        stripeTransactionId: `inv_${Date.now().toString(36)}`,
        description: `Partner 15% commission (${kwh.toFixed(2)} kWh)`,
        createdAt: nowIso,
        completedAt: nowIso,
      });
    }

    delete this.state.liveTelemetry[session.id];
    this.pushTelemetryEvent({
      id: `tel-${Date.now().toString(36)}`,
      timestamp: nowIso,
      chargingPointId: session.chargingPointId,
      chargingPointName: session.chargingPointName,
      connectorId: session.connectorId,
      eventType: 'StatusNotification',
      protocol: session.chargingPointType === 'private_host' ? 'OCPP 2.0.1' : 'OCPI 2.2',
      powerKw: 0,
      meterWh: session.meterReadingEndWh,
      status: 'available',
      summary: `Session ${session.id} settled (${session.energyDeliveredKwh.toFixed(2)} kWh) · connector available.`,
    });

    this.setConnectorStatus(session.chargingPointId, session.connectorId, 'available');
    this.bumpRevision();
    this.saveToDisk();
    return session;
  }

  public addReview(input: {
    chargingPointId: string;
    driverId: string;
    rating: number;
    comment: string;
  }): Review {
    const cp = this.state.chargingPoints.find((p) => p.id === input.chargingPointId);
    if (!cp) throw new Error('Charging point not found.');
    const driver = this.state.drivers.find((d) => d.uid === input.driverId);

    const review: Review = {
      id: makeUniqueId('rev'),
      chargingPointId: cp.id,
      driverId: input.driverId,
      driverName: driver?.name || 'Driver',
      rating: Math.max(1, Math.min(5, Math.round(input.rating))),
      comment: input.comment.trim(),
      createdAt: new Date().toISOString(),
    };

    this.state.reviews.unshift(review);
    const pointReviews = this.state.reviews.filter(
      (r) => r.chargingPointId === cp.id
    );
    const avg =
      pointReviews.reduce((acc, r) => acc + r.rating, 0) / pointReviews.length;
    cp.rating = Math.round(avg * 10) / 10;
    cp.reviewCount = pointReviews.length;
    this.bumpRevision();
    this.saveToDisk();
    return review;
  }

  public resolveDispute(
    sessionId: string,
    input: {
      action: 'approve_adjusted' | 'refund';
      adjustedMeterEndWh?: number;
    }
  ): ChargingSession {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found.');
    if (session.status !== 'disputed') {
      throw new Error('Session is not in disputed state.');
    }

    const res = this.state.reservations.find((r) => r.id === session.reservationId);
    const nowIso = new Date().toISOString();

    if (input.action === 'refund') {
      session.status = 'completed';
      session.amount = 0;
      session.commission = 0;
      session.hostPayout = 0;
      session.disputeReason = `${session.disputeReason || ''} — Resolved via full Stripe refund.`;
      if (res) res.status = 'completed';

      this.state.payments.unshift({
        id: `pay-${Date.now().toString(36)}-ref`,
        sessionId: session.id,
        driverId: session.driverId,
        hostId: session.hostId,
        amount: 0,
        type: 'charge',
        status: 'refunded',
        stripeTransactionId: `re_${Date.now().toString(36)}`,
        description: `Dispute resolved: Stripe refund issued to driver`,
        createdAt: nowIso,
        completedAt: nowIso,
      });
    } else {
      const startWh = session.meterReadingStartWh ?? 0;
      const endWh =
        input.adjustedMeterEndWh ?? session.meterReadingEndWh ?? startWh + 10000;
      const billing = calculateMeteredBilling(
        startWh,
        endWh,
        session.pricePerKwh,
        0.2
      );
      session.meterReadingEndWh = endWh;
      session.energyDeliveredKwh = billing.energyDeliveredKwh;
      session.amount = billing.grossAmount;
      session.commission = billing.imchargeCommission;
      session.hostPayout = billing.hostPayout;
      session.status = 'completed';
      session.disputeReason = undefined;
      if (res) res.status = 'completed';

      this.state.payments.unshift(
        {
          id: `pay-${Date.now().toString(36)}-adj`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.grossAmount,
          type: 'charge',
          status: 'completed',
          stripeTransactionId: `pi_adj_${Date.now().toString(36)}`,
          description: `Adjusted meter settlement · ${billing.energyDeliveredKwh.toFixed(2)} kWh`,
          createdAt: nowIso,
          completedAt: nowIso,
        },
        {
          id: `pay-${Date.now().toString(36)}-po`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.hostPayout,
          type: 'payout',
          status: 'pending',
          stripeTransactionId: `po_adj_${Date.now().toString(36)}`,
          description: `Host 80% adjusted share pending payout`,
          createdAt: nowIso,
        }
      );
    }

    this.bumpRevision();
    this.saveToDisk();
    return session;
  }

  public syncPartner(partnerId: string): PartnerIntegration {
    const partner = this.state.partners.find((p) => p.id === partnerId);
    if (!partner) throw new Error('Partner integration not found.');

    partner.lastSyncTime = new Date().toISOString();
    partner.status = 'active';
    const matchingPoints = this.state.chargingPoints.filter(
      (cp) => cp.partnerName?.toLowerCase() === partner.partnerName.toLowerCase()
    );
    partner.syncedStationsCount = matchingPoints.length;
    for (const cp of matchingPoints) {
      cp.updatedAt = partner.lastSyncTime;
    }
    this.bumpRevision();
    this.saveToDisk();
    return partner;
  }

  public processHostPayouts(hostId?: string): number {
    const nowIso = new Date().toISOString();
    let count = 0;
    for (const p of this.state.payments) {
      if (
        p.type === 'payout' &&
        p.status === 'pending' &&
        (!hostId || p.hostId === hostId)
      ) {
        p.status = 'completed';
        p.completedAt = nowIso;
        count++;
      }
    }
    if (count > 0) {
      this.bumpRevision();
      this.saveToDisk();
    }
    return count;
  }

  public setTelemetryHeartbeat(enabled: boolean): boolean {
    this.state.telemetryHeartbeatEnabled = enabled;
    this.bumpRevision();
    this.saveToDisk();
    return enabled;
  }

  public tickActiveTelemetry(
    stepSeconds: number = 2,
    energyScaleFactor: number = 30
  ): number {
    const activeSessions = this.state.sessions.filter(
      (s) => s.status === 'in_progress'
    );
    if (activeSessions.length === 0) return 0;

    const nowIso = new Date().toISOString();
    let updatedCount = 0;

    for (const session of activeSessions) {
      const cp = this.state.chargingPoints.find(
        (p) => p.id === session.chargingPointId
      );
      const conn = cp?.connectors.find((c) => c.id === session.connectorId);
      const connectorPowerKw = conn?.powerKw ?? 22;
      const startMeterWh = session.meterReadingStartWh ?? 0;
      const protocol: TelemetryProtocol =
        session.chargingPointType === 'private_host' ? 'OCPP 2.0.1' : 'OCPI 2.2';

      const current: LiveTelemetryReading =
        this.state.liveTelemetry[session.id] ?? {
          sessionId: session.id,
          chargingPointId: session.chargingPointId,
          connectorId: session.connectorId,
          livePowerKw: round2(Math.max(1, connectorPowerKw * 0.92)),
          deliveredKwh: session.energyDeliveredKwh || 0,
          currentMeterWh: Math.round(
            startMeterWh + (session.energyDeliveredKwh || 0) * 1000
          ),
          estimatedCostInr: round2(
            (session.energyDeliveredKwh || 0) * session.pricePerKwh
          ),
          elapsedSeconds: 0,
          protocol,
          lastUpdatedAt: nowIso,
        };

      const next = advanceTelemetryReading(
        current,
        startMeterWh,
        connectorPowerKw,
        session.pricePerKwh,
        stepSeconds,
        nowIso,
        energyScaleFactor
      );

      this.state.liveTelemetry[session.id] = next;
      session.energyDeliveredKwh = next.deliveredKwh;
      updatedCount++;
    }

    if (updatedCount > 0) {
      this.bumpRevision();
      this.saveToDisk();
    }
    return updatedCount;
  }

  public ingestOcppTelemetry(payload: OcppTelemetryPayload): {
    event: TelemetryEventRecord;
    cancelledReservationIds: string[];
  } {
    const cp = this.state.chargingPoints.find(
      (p) => p.id === payload.chargingPointId
    );
    if (!cp) throw new Error('Charging point not found for telemetry event.');
    const conn = cp.connectors.find((c) => c.id === payload.connectorId);
    if (!conn) throw new Error('Connector not found for telemetry event.');

    const nowIso = new Date().toISOString();
    const protocol: TelemetryProtocol =
      cp.type === 'private_host' ? 'OCPP 2.0.1' : 'OCPI 2.2';
    const activeSession = this.state.sessions.find(
      (s) =>
        s.chargingPointId === cp.id &&
        s.connectorId === conn.id &&
        s.status === 'in_progress'
    );

    const hasActive = Boolean(activeSession);
    const detectedWalkIn =
      payload.eventType === 'WalkInLoadDetected' ||
      (payload.status === 'occupied' && !hasActive) ||
      isUnbookedWalkInLoad(payload.powerKw ?? 0, hasActive);

    if (detectedWalkIn) {
      const loadKw = round2(
        payload.powerKw !== undefined && payload.powerKw > 0.5
          ? payload.powerKw
          : Math.min(conn.powerKw, 7.4)
      );
      const result = this.updateConnectorStatus(
        cp.id,
        conn.id,
        'occupied',
        `Auto-flagged occupied via ${protocol} smart meter load (${loadKw.toFixed(1)} kW).`
      );
      const cancelledSuffix =
        result.cancelledReservationIds.length > 0
          ? ` Auto-cancelled hold(s): ${result.cancelledReservationIds.join(', ')}.`
          : '';
      const event: TelemetryEventRecord = {
        id: `tel-${Date.now().toString(36)}`,
        timestamp: nowIso,
        chargingPointId: cp.id,
        chargingPointName: cp.name,
        connectorId: conn.id,
        eventType: 'WalkInLoadDetected',
        protocol,
        powerKw: loadKw,
        meterWh: payload.meterWh,
        status: 'occupied',
        summary: `Unbooked ${loadKw.toFixed(1)} kW draw detected on ${conn.id}; connector marked occupied.${cancelledSuffix}`,
      };
      this.pushTelemetryEvent(event);
      this.bumpRevision();
      this.saveToDisk();
      return {
        event,
        cancelledReservationIds: result.cancelledReservationIds,
      };
    }

    if (
      payload.eventType === 'StatusNotification' &&
      (payload.status === 'available' || payload.status === 'maintenance')
    ) {
      const result = this.updateConnectorStatus(
        cp.id,
        conn.id,
        payload.status,
        `${protocol} StatusNotification set connector to ${payload.status}.`
      );
      const event: TelemetryEventRecord = {
        id: makeUniqueId('tel'),
        timestamp: nowIso,
        chargingPointId: cp.id,
        chargingPointName: cp.name,
        connectorId: conn.id,
        eventType: 'StatusNotification',
        protocol,
        powerKw: round2(payload.powerKw ?? 0),
        meterWh: payload.meterWh,
        status: payload.status,
        summary: `StatusNotification updated ${conn.id} to ${payload.status}.`,
      };
      this.pushTelemetryEvent(event);
      this.bumpRevision();
      this.saveToDisk();
      return {
        event,
        cancelledReservationIds: result.cancelledReservationIds,
      };
    }

    if (activeSession) {
      const startMeterWh = activeSession.meterReadingStartWh ?? 0;
      const baseReading: LiveTelemetryReading =
        this.state.liveTelemetry[activeSession.id] ?? {
          sessionId: activeSession.id,
          chargingPointId: cp.id,
          connectorId: conn.id,
          livePowerKw: round2(
            payload.powerKw ?? Math.max(1, conn.powerKw * 0.92)
          ),
          deliveredKwh: activeSession.energyDeliveredKwh || 0,
          currentMeterWh: Math.round(
            startMeterWh + (activeSession.energyDeliveredKwh || 0) * 1000
          ),
          estimatedCostInr: round2(
            (activeSession.energyDeliveredKwh || 0) * cp.pricePerKwh
          ),
          elapsedSeconds: 0,
          protocol,
          lastUpdatedAt: nowIso,
        };

      let next: LiveTelemetryReading;
      if (
        payload.meterWh !== undefined &&
        Number.isFinite(payload.meterWh) &&
        payload.meterWh >= startMeterWh
      ) {
        const deliveredKwh = round2((payload.meterWh - startMeterWh) / 1000);
        next = {
          ...baseReading,
          livePowerKw: round2(
            payload.powerKw !== undefined && payload.powerKw > 0
              ? payload.powerKw
              : baseReading.livePowerKw
          ),
          deliveredKwh,
          currentMeterWh: Math.round(payload.meterWh),
          estimatedCostInr: round2(deliveredKwh * cp.pricePerKwh),
          elapsedSeconds: baseReading.elapsedSeconds + 15,
          lastUpdatedAt: nowIso,
        };
      } else {
        const seeded =
          payload.powerKw !== undefined && payload.powerKw > 0
            ? { ...baseReading, livePowerKw: round2(payload.powerKw) }
            : baseReading;
        next = advanceTelemetryReading(
          seeded,
          startMeterWh,
          conn.powerKw,
          cp.pricePerKwh,
          15,
          nowIso,
          20
        );
      }

      this.state.liveTelemetry[activeSession.id] = next;
      activeSession.energyDeliveredKwh = next.deliveredKwh;

      const event: TelemetryEventRecord = {
        id: `tel-${Date.now().toString(36)}`,
        timestamp: nowIso,
        chargingPointId: cp.id,
        chargingPointName: cp.name,
        connectorId: conn.id,
        eventType: 'MeterValues',
        protocol,
        powerKw: next.livePowerKw,
        meterWh: next.currentMeterWh,
        status: 'occupied',
        summary: `MeterValues pulse for ${activeSession.id}: ${next.livePowerKw.toFixed(1)} kW · ${next.deliveredKwh.toFixed(2)} kWh (₹${next.estimatedCostInr.toFixed(2)}).`,
      };
      this.pushTelemetryEvent(event);
      this.bumpRevision();
      this.saveToDisk();
      return { event, cancelledReservationIds: [] };
    }

    const idleKw = round2(Math.max(0, payload.powerKw ?? 0));
    const event: TelemetryEventRecord = {
      id: makeUniqueId('tel'),
      timestamp: nowIso,
      chargingPointId: cp.id,
      chargingPointName: cp.name,
      connectorId: conn.id,
      eventType: 'MeterValues',
      protocol,
      powerKw: idleKw,
      meterWh: payload.meterWh,
      status: conn.status,
      summary: `Idle MeterValues pulse on ${conn.id} (${idleKw.toFixed(2)} kW, below 0.5 kW load threshold).`,
    };
    this.pushTelemetryEvent(event);
    this.bumpRevision();
    this.saveToDisk();
    return { event, cancelledReservationIds: [] };
  }

  public resetDemoData(): PlatformSnapshot {
    this.state = createInitialSeedState();
    this.saveToDisk();
    return this.getSnapshot();
  }
}

export const store = new ImChargeStore();
