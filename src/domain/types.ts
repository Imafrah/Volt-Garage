export type UserRole = 'driver' | 'host' | 'admin';
export type KycStatus = 'pending' | 'verified' | 'rejected';
export type ChargingPointType = 'existing_station' | 'private_host';
export type ConnectorType = 'Type1' | 'Type2' | 'CCS' | 'CHAdeMO';
export type ConnectorStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';
export type ReservationStatus =
  | 'reserved'
  | 'confirmed'
  | 'charging'
  | 'completed'
  | 'disputed'
  | 'cancelled';
export type SessionStatus = 'in_progress' | 'completed' | 'disputed';
export type PaymentType = 'charge' | 'commission' | 'payout';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PartnerStatus = 'active' | 'inactive' | 'error';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  batteryCapacity: number; // kWh
  connectorType: ConnectorType[];
}

export interface DriverProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  rating: number;
  reviewCount: number;
  vehicles: Vehicle[];
  defaultLocation: GeoPoint;
  paymentMethodLabel: string;
}

export interface HostEquipment {
  brand: string;
  model: string;
  powerKw: number;
  connectorType: ConnectorType[];
  meterSerialNumber: string;
}

export interface HostProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  chargingPointType: ChargingPointType;
  kycStatus: KycStatus;
  rating: number;
  reviewCount: number;
  partnerNetwork?: string;
  partnerStationId?: string;
  commissionRate: number; // e.g., 0.20 for private host, 0.15 for existing station
  bankAccountIban: string;
  equipment?: HostEquipment;
  availability: {
    weekdays: string;
    weekends: string;
  };
}

export interface Connector {
  id: string;
  type: ConnectorType;
  powerKw: number;
  status: ConnectorStatus;
}

export interface ChargingPoint {
  id: string;
  hostUid: string;
  hostName: string;
  type: ChargingPointType;
  partnerName?: string;
  location: GeoPoint;
  address: string;
  name: string;
  description: string;
  connectors: Connector[];
  pricePerKwh: number;
  commissionRate: number;
  rating: number;
  reviewCount: number;
  photos: string[];
  availabilityHours: string;
  kycVerified: boolean;
  meterSerialNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  driverId: string;
  driverName: string;
  hostId: string;
  chargingPointId: string;
  chargingPointName: string;
  chargingPointType: ChargingPointType;
  connectorId: string;
  connectorType: ConnectorType;
  powerKw: number;
  pricePerKwh: number;
  status: ReservationStatus;
  reservedAt: string;
  expiresAt: string;
  confirmedAt?: string;
  startedAt?: string;
  completedAt?: string;
  qrCodeToken: string;
  distanceKm: number;
  notes?: string;
}

export interface ChargingSession {
  id: string;
  reservationId: string;
  driverId: string;
  driverName: string;
  hostId: string;
  chargingPointId: string;
  chargingPointName: string;
  chargingPointType: ChargingPointType;
  connectorId: string;
  pricePerKwh: number;
  startTime: string;
  endTime?: string;
  energyDeliveredKwh: number;
  meterReadingStartWh?: number;
  meterReadingEndWh?: number;
  meterPhotoStart?: string;
  meterPhotoEnd?: string;
  amount: number;
  commission: number;
  hostPayout: number;
  idleMinutes?: number;
  idleFee?: number;
  unpluggedAt?: string;
  status: SessionStatus;
  disputeReason?: string;
}

export interface PaymentRecord {
  id: string;
  sessionId: string;
  driverId: string;
  hostId: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  stripeTransactionId: string;
  description: string;
  createdAt: string;
  completedAt?: string;
}

export interface Review {
  id: string;
  chargingPointId: string;
  driverId: string;
  driverName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface PartnerIntegration {
  id: string;
  partnerName: string;
  apiEndpoint: string;
  lastSyncTime: string;
  syncIntervalMinutes: number;
  status: PartnerStatus;
  syncedStationsCount: number;
  commissionRate: number;
}

export interface AdminAnalytics {
  totalBookings: number;
  activeSessions: number;
  completedSessions: number;
  disputedSessions: number;
  grossVolumeInr: number;
  netCommissionInr: number;
  hostPayoutsInr: number;
  completionRatePct: number;
  disputeRatePct: number;
  activeDriversCount: number;
  activeHostsCount: number;
}

export interface BackupConnectorSuggestion {
  point: ChargingPoint;
  connector: Connector;
  distanceKm: number;
  etaMinutes: number;
}

export interface DriverRegistrationInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  paymentMethodLabel: string;
  vehicle: {
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    batteryCapacity: number;
    connectorType: ConnectorType[];
  };
}

export interface HostRegistrationInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  chargingPointType: ChargingPointType;
  bankAccountIban: string;
  partnerNetwork?: string;
  partnerStationId?: string;
  equipment?: {
    brand: string;
    model: string;
    powerKw: number;
    connectorType: ConnectorType[];
    meterSerialNumber: string;
  };
  availability: {
    weekdays: string;
    weekends: string;
  };
}

export type TelemetryProtocol = 'OCPP 2.0.1' | 'OCPI 2.2' | 'Smart Meter RS485';
export type TelemetryEventType =
  | 'MeterValues'
  | 'StatusNotification'
  | 'WalkInLoadDetected';

export interface LiveTelemetryReading {
  sessionId: string;
  chargingPointId: string;
  connectorId: string;
  livePowerKw: number;
  deliveredKwh: number;
  currentMeterWh: number;
  estimatedCostInr: number;
  elapsedSeconds: number;
  protocol: TelemetryProtocol;
  lastUpdatedAt: string;
}

export interface TelemetryEventRecord {
  id: string;
  timestamp: string;
  chargingPointId: string;
  chargingPointName: string;
  connectorId: string;
  eventType: TelemetryEventType;
  protocol: TelemetryProtocol;
  powerKw: number;
  meterWh?: number;
  status: ConnectorStatus;
  summary: string;
}

export interface OcppTelemetryPayload {
  chargingPointId: string;
  connectorId: string;
  eventType: TelemetryEventType;
  powerKw?: number;
  meterWh?: number;
  status?: ConnectorStatus;
}

export interface PlatformSnapshot {
  drivers: DriverProfile[];
  hosts: HostProfile[];
  chargingPoints: ChargingPoint[];
  reservations: Reservation[];
  sessions: ChargingSession[];
  payments: PaymentRecord[];
  reviews: Review[];
  partners: PartnerIntegration[];
  analytics: AdminAnalytics;
  liveTelemetry: Record<string, LiveTelemetryReading>;
  telemetryEvents: TelemetryEventRecord[];
  telemetryHeartbeatEnabled: boolean;
}
