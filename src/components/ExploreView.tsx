import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  Clock,
  LocateFixed,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  PROXIMITY_RADIUS_KM,
  calculateDistanceKm,
  estimateEtaMinutes,
  scoreChargingPoint,
} from '../domain/imchargeEngine';
import type {
  ChargingPoint,
  ConnectorType,
  DriverProfile,
  GeoPoint,
  Reservation,
  Review,
} from '../domain/types';
import { ChargerBay3D } from './ChargerBay3D';
import { CityMap } from './CityMap';

interface ExploreViewProps {
  points: ChargingPoint[];
  reviews: Review[];
  reservations: Reservation[];
  driver: DriverProfile;
  onReserve: (
    chargingPointId: string,
    connectorId: string,
    enforceProximity: boolean
  ) => Promise<void>;
  onUpdateDriverLocation: (location: GeoPoint) => Promise<Reservation[]>;
  onGoToTrips: () => void;
}

const LOCATION_PRESETS: {
  id: string;
  label: string;
  location: GeoPoint;
}[] = [
  {
    id: 'marienplatz',
    label: 'Marienplatz Downtown (48.137°N, 11.576°E)',
    location: { lat: 48.137154, lon: 11.576124 },
  },
  {
    id: 'schwabing',
    label: 'Schwabing North (48.175°N, 11.592°E)',
    location: { lat: 48.175, lon: 11.592 },
  },
  {
    id: 'garching',
    label: 'Garching Corridor (~13.6 km North)',
    location: { lat: 48.2489, lon: 11.651 },
  },
  {
    id: 'airport',
    label: 'Munich Airport (~29 km · Out of 10 km Range)',
    location: { lat: 48.3537, lon: 11.775 },
  },
];

export function ExploreView({
  points,
  reviews,
  reservations,
  driver,
  onReserve,
  onUpdateDriverLocation,
  onGoToTrips,
}: ExploreViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'private_host' | 'existing_station'
  >('all');
  const [connectorFilter, setConnectorFilter] = useState<'all' | ConnectorType>(
    'all'
  );
  const [radiusKm, setRadiusKm] = useState<number>(PROXIMITY_RADIUS_KM);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [matchVehicle, setMatchVehicle] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    points[0]?.id ?? null
  );
  const [busyConnectorId, setBusyConnectorId] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [geofenceAlert, setGeofenceAlert] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [detailMediaMode, setDetailMediaMode] = useState<'photo' | '3d'>('photo');

  const primaryVehicle = driver.vehicles[0];
  const activeDriverHolds = useMemo(
    () =>
      reservations.filter(
        (r) => r.driverId === driver.uid && r.status === 'reserved'
      ),
    [reservations, driver.uid]
  );

  const selectedPresetId = useMemo(() => {
    const match = LOCATION_PRESETS.find(
      (p) =>
        Math.abs(p.location.lat - driver.defaultLocation.lat) < 0.002 &&
        Math.abs(p.location.lon - driver.defaultLocation.lon) < 0.002
    );
    return match?.id ?? 'custom';
  }, [driver.defaultLocation]);

  const filteredPoints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return points
      .filter((p) => {
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;
        if (
          connectorFilter !== 'all' &&
          !p.connectors.some((c) => c.type === connectorFilter)
        ) {
          return false;
        }
        if (
          availableOnly &&
          !p.connectors.some((c) => c.status === 'available')
        ) {
          return false;
        }
        if (matchVehicle && primaryVehicle) {
          const compatible = p.connectors.some((c) =>
            primaryVehicle.connectorType.includes(c.type)
          );
          if (!compatible) return false;
        }
        const dist = calculateDistanceKm(driver.defaultLocation, p.location);
        if (dist > radiusKm) return false;
        if (
          q &&
          !p.name.toLowerCase().includes(q) &&
          !p.address.toLowerCase().includes(q) &&
          !(p.partnerName || '').toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          scoreChargingPoint(
            b,
            driver.defaultLocation,
            primaryVehicle?.connectorType ?? []
          ) -
          scoreChargingPoint(
            a,
            driver.defaultLocation,
            primaryVehicle?.connectorType ?? []
          )
      );
  }, [
    points,
    searchQuery,
    typeFilter,
    connectorFilter,
    availableOnly,
    matchVehicle,
    radiusKm,
    driver.defaultLocation,
    primaryVehicle,
  ]);

  const selectedPoint =
    filteredPoints.find((p) => p.id === selectedId) ?? filteredPoints[0] ?? null;

  const selectedReviews = useMemo(
    () =>
      selectedPoint
        ? reviews.filter((r) => r.chargingPointId === selectedPoint.id)
        : [],
    [reviews, selectedPoint]
  );

  const selectedDistance = selectedPoint
    ? calculateDistanceKm(driver.defaultLocation, selectedPoint.location)
    : 0;

  async function handleLocationUpdate(location: GeoPoint, sourceLabel: string) {
    setLocationBusy(true);
    setGeofenceAlert(null);
    setFeedback(null);
    try {
      const released = await onUpdateDriverLocation(location);
      if (released.length > 0) {
        const names = released
          .map((r) => `${r.chargingPointName} (${r.connectorId})`)
          .join(', ');
        setGeofenceAlert(
          `Moved to ${sourceLabel}: you exited the ${PROXIMITY_RADIUS_KM} km booking range. Auto-unreserved ${names} so other drivers can book immediately.`
        );
      } else {
        setFeedback({
          kind: 'success',
          text: `Driver location updated to ${sourceLabel}. Active holds within ${PROXIMITY_RADIUS_KM} km remain secured.`,
        });
      }
    } catch (err) {
      const msg = (err as Error).message;
      setFeedback({
        kind: 'error',
        text: msg,
      });
      toast.error(msg);
    } finally {
      setLocationBusy(false);
    }
  }

  async function handleBrowserGps() {
    if (!navigator.geolocation) {
      const msg = 'Browser geolocation is unavailable. Use a Munich GPS preset instead.';
      setFeedback({
        kind: 'error',
        text: msg,
      });
      toast.error(msg);
      return;
    }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleLocationUpdate(
          { lat: pos.coords.latitude, lon: pos.coords.longitude },
          'Live Browser GPS'
        );
      },
      () => {
        setLocationBusy(false);
        const msg = 'Location permission denied. Select a GPS preset to test the 10 km geofence.';
        setFeedback({
          kind: 'error',
          text: msg,
        });
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  async function handleReserveClick(pointId: string, connectorId: string) {
    setFeedback(null);
    setBusyConnectorId(connectorId);
    try {
      await onReserve(pointId, connectorId, true);
      setFeedback({
        kind: 'success',
        text: `Slot held for 30 minutes (within ${PROXIMITY_RADIUS_KM} km geofence). QR token generated in Driver Trips.`,
      });
    } catch (err) {
      const msg = (err as Error).message;
      setFeedback({
        kind: 'error',
        text: msg,
      });
      toast.error(msg);
    } finally {
      setBusyConnectorId(null);
    }
  }

  const isSelectedOutOfRange = selectedDistance > PROXIMITY_RADIUS_KM;
  const distanceFromMunichMetroKm = calculateDistanceKm(driver.defaultLocation, {
    lat: 48.137154,
    lon: 11.576124,
  });
  const isOutsideMunichDemoZone = distanceFromMunichMetroKm > 25;

  return (
    <div className="space-y-6">
      {/* Live Driver GPS & 10 km Booking Geofence Control */}
      <section
        aria-label="Driver live location and 10 km booking geofence"
        className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs"
      >
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-900">
              <LocateFixed className="h-3.5 w-3.5 text-zinc-600" />
              <span>Location Anchor · 10 km Active Geofence</span>
              <span aria-hidden="true" className="text-zinc-300">·</span>
              <span className="font-mono font-normal text-zinc-600 tabular-nums">
                {driver.defaultLocation.lat.toFixed(4)}°N,{' '}
                {driver.defaultLocation.lon.toFixed(4)}°E
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Reservations require proximity within {PROXIMITY_RADIUS_KM} km. Roaming outside automatically unreserves your hold to keep bays liquid.
              {activeDriverHolds.length > 0 && (
                <span className="ml-1 font-medium text-emerald-700">
                  ({activeDriverHolds.length} active hold monitored)
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="driver-gps-preset" className="sr-only">
              Driver live GPS location preset
            </label>
            <select
              id="driver-gps-preset"
              disabled={locationBusy}
              value={selectedPresetId}
              onChange={(e) => {
                const preset = LOCATION_PRESETS.find(
                  (p) => p.id === e.target.value
                );
                if (preset) {
                  handleLocationUpdate(preset.location, preset.label);
                }
              }}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 focus:border-zinc-400 focus:outline-none"
            >
              {selectedPresetId === 'custom' && (
                <option value="custom">
                  Custom GPS ({driver.defaultLocation.lat.toFixed(3)},{' '}
                  {driver.defaultLocation.lon.toFixed(3)})
                </option>
              )}
              {LOCATION_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={locationBusy}
              onClick={handleBrowserGps}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              <LocateFixed className="h-3.5 w-3.5 text-zinc-500" />
              Use Device GPS
            </button>
          </div>
        </div>

        {geofenceAlert && (
          <div
            role="alert"
            data-testid="geofence-auto-unreserve-alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs font-medium text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>{geofenceAlert}</span>
          </div>
        )}

        {isOutsideMunichDemoZone && (
          <div
            role="status"
            className="mt-3 flex flex-col justify-between gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 sm:flex-row sm:items-center"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <span>
                Your GPS anchor is {distanceFromMunichMetroKm.toLocaleString()} km from the Munich demo grid, so local chargers are hidden by the {PROXIMITY_RADIUS_KM} km geofence.
              </span>
            </div>
            <button
              type="button"
              disabled={locationBusy}
              onClick={() =>
                handleLocationUpdate(
                  LOCATION_PRESETS[0].location,
                  LOCATION_PRESETS[0].label
                )
              }
              className="shrink-0 whitespace-nowrap rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              Return GPS to Munich Downtown
            </button>
          </div>
        )}
      </section>
      {/* Workspace Filter Toolbar */}
      <section
        aria-label="Charging station filters"
        className="rounded-xl border border-zinc-200/90 bg-white p-3.5 shadow-xs sm:p-4"
      >
        <div className="flex flex-col gap-3">
          {/* Row 1: Search + type filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <label htmlFor="charger-search" className="sr-only">
                Search charging stations or addresses
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                id="charger-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by station, street, or partner..."
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Host type filter"
              className="flex items-center gap-1 overflow-x-auto max-w-full rounded-lg bg-zinc-100 p-1 scrollbar-none shrink-0"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'private_host', label: 'Private' },
                  { id: 'existing_station', label: 'Partner' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTypeFilter(item.id)}
                  className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === item.id
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Connector + radius + toggles */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
            <div>
              <label htmlFor="connector-filter" className="sr-only">
                Connector type
              </label>
              <select
                id="connector-filter"
                value={connectorFilter}
                onChange={(e) =>
                  setConnectorFilter(e.target.value as 'all' | ConnectorType)
                }
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 focus:border-emerald-600 focus:outline-none"
              >
                <option value="all">All Connectors</option>
                <option value="Type2">Type 2 (AC)</option>
                <option value="CCS">CCS (DC Fast)</option>
                <option value="CHAdeMO">CHAdeMO</option>
                <option value="Type1">Type 1</option>
              </select>
            </div>

            <label className="flex items-center gap-2 font-medium">
              <span>Radius</span>
              <input
                type="range"
                min={2}
                max={20}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-20 accent-emerald-600 sm:w-24"
              />
              <span className="w-11 font-mono tabular-nums text-zinc-900">
                {radiusKm} km
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 accent-emerald-600"
              />
              <span>Available only</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={matchVehicle}
                onChange={(e) => setMatchVehicle(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 accent-emerald-600"
              />
              <span>
                Match {primaryVehicle ? primaryVehicle.model : 'vehicle'}
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* Main Split: Map + Directory on Left, Charger Detail + Booking on Right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-7">
          <CityMap
            points={filteredPoints}
            selectedId={selectedPoint?.id ?? null}
            onSelect={(id) => {
              setSelectedId(id);
              setFeedback(null);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                document.getElementById('station-detail-section')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            driverLocation={driver.defaultLocation}
            radiusKm={radiusKm}
            onMoveDriverLocation={(location, roadName) => {
              handleLocationUpdate(location, roadName || 'Munich Road');
            }}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">
                Nearby Charging Points
              </h2>
              <span className="font-mono text-xs tabular-nums text-zinc-500">
                {filteredPoints.length} matching locations
              </span>
            </div>

            {filteredPoints.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
                <p className="text-sm font-medium text-zinc-900">
                  No charging points match your current filters
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Try increasing your search radius or resetting connector filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setTypeFilter('all');
                    setConnectorFilter('all');
                    setRadiusKm(15);
                    setAvailableOnly(false);
                    setMatchVehicle(false);
                  }}
                  className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                {filteredPoints.map((point) => {
                  const dist = calculateDistanceKm(
                    driver.defaultLocation,
                    point.location
                  );
                  const freeCount = point.connectors.filter(
                    (c) => c.status === 'available'
                  ).length;
                  const maxKw = Math.max(
                    ...point.connectors.map((c) => c.powerKw)
                  );
                  const isSelected = selectedPoint?.id === point.id;

                  return (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(point.id);
                        setFeedback(null);
                        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                          document.getElementById('station-detail-section')?.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className={`flex w-full flex-col gap-3 p-4 text-left transition-colors sm:flex-row sm:items-center ${
                        isSelected ? 'bg-emerald-50/50' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <div className="h-20 w-full shrink-0 overflow-hidden rounded-lg bg-zinc-100 sm:w-28">
                        {point.photos[0] && !imgErrors[point.id] ? (
                          <img
                            src={point.photos[0]}
                            alt={point.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setImgErrors((prev) => ({
                                ...prev,
                                [point.id]: true,
                              }))
                            }
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400">
                            <Zap className="h-5 w-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="truncate text-sm font-semibold text-zinc-900">
                            {point.name}
                          </h3>
                          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-zinc-900">
                            ₹{point.pricePerKwh.toFixed(2)}/kWh
                          </span>
                        </div>

                        <p className="truncate text-xs text-zinc-500">
                          {point.address}
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-600">
                          <span className="font-medium text-zinc-700">
                            {point.type === 'private_host'
                              ? 'Private Host'
                              : `${point.partnerName || 'Partner'} Hub`}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {dist} km
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Up to {maxKw} kW
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              freeCount > 0
                                ? 'font-medium text-emerald-700'
                                : 'font-medium text-amber-700'
                            }
                          >
                            {freeCount}/{point.connectors.length} available
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums text-zinc-700">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {point.rating.toFixed(1)} ({point.reviewCount})
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Detail & Instant Hold Panel */}
        <aside id="station-detail-section" className="lg:col-span-5">
          {selectedPoint ? (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
                <span className="text-xs font-medium text-zinc-600">
                  Station Inspection
                </span>
                <div
                  role="group"
                  aria-label="Station preview mode"
                  className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setDetailMediaMode('photo')}
                    aria-pressed={detailMediaMode === 'photo'}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      detailMediaMode === 'photo'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Camera className="h-3 w-3" />
                    Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailMediaMode('3d')}
                    aria-pressed={detailMediaMode === '3d'}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      detailMediaMode === '3d'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Box className="h-3 w-3 text-emerald-600" />
                    3D Bay Twin
                  </button>
                </div>
              </div>

              {detailMediaMode === '3d' ? (
                <ChargerBay3D
                  point={selectedPoint}
                  initialPowerFlow={selectedPoint.connectors.some(
                    (c) => c.status === 'occupied'
                  )}
                  heightClassName="h-56 sm:h-72"
                />
              ) : (
                <div className="relative aspect-4/3 w-full bg-zinc-100">
                  {selectedPoint.photos[0] && !imgErrors[selectedPoint.id] ? (
                    <img
                      src={selectedPoint.photos[0]}
                      alt={selectedPoint.name}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setImgErrors((prev) => ({
                          ...prev,
                          [selectedPoint.id]: true,
                        }))
                      }
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-100 text-zinc-500">
                      <Zap className="h-8 w-8" />
                      <span className="text-xs font-medium">
                        {selectedPoint.name}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-5 p-4 sm:p-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span className="font-medium text-emerald-700">
                      {selectedPoint.type === 'private_host'
                        ? 'Private Host · 80/20 Metered'
                        : `${selectedPoint.partnerName || 'Partner'} · 15% Commission`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      KYC Verified
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-zinc-900">
                    {selectedPoint.name}
                  </h2>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                      {selectedPoint.address}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {selectedDistance} km (~
                      {estimateEtaMinutes(selectedDistance)} min)
                    </span>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-zinc-600">
                  {selectedPoint.description}
                </p>

                <div className="grid grid-cols-2 gap-4 border-y border-zinc-200 py-3 text-xs">
                  <div>
                    <div className="text-zinc-500">Tariff Rate</div>
                    <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-zinc-900">
                      ₹{selectedPoint.pricePerKwh.toFixed(2)} / kWh
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Availability</div>
                    <div className="mt-0.5 inline-flex items-center gap-1 font-medium text-zinc-900">
                      <Clock className="h-3.5 w-3.5 text-zinc-400" />
                      {selectedPoint.availabilityHours}
                    </div>
                  </div>
                  {selectedPoint.meterSerialNumber && (
                    <div className="col-span-2">
                      <div className="text-zinc-500">Smart Meter Serial</div>
                      <div className="mt-0.5 font-mono text-xs text-zinc-800">
                        {selectedPoint.meterSerialNumber}
                      </div>
                    </div>
                  )}
                </div>

                {isSelectedOutOfRange && (
                  <div
                    role="status"
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                  >
                    <p className="font-semibold">
                      Out of Booking Range ({selectedDistance} km away)
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      To reserve this station, your live location must be within the 9–10 km geofence (max {PROXIMITY_RADIUS_KM} km).
                    </p>
                  </div>
                )}

                {feedback && (
                  <div
                    role="status"
                    className={`rounded-lg border p-3 text-xs ${
                      feedback.kind === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-red-200 bg-red-50 text-red-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{feedback.text}</span>
                      {feedback.kind === 'success' && (
                        <button
                          type="button"
                          onClick={onGoToTrips}
                          className="shrink-0 font-semibold underline hover:no-underline"
                        >
                          Open Driver Trips
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold tracking-tight text-zinc-900">
                    Connectors & Instant 30-Minute Hold
                  </h3>
                  <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
                    {selectedPoint.connectors.map((conn) => {
                      const isAvailable = conn.status === 'available';
                      const canBookNow = isAvailable && !isSelectedOutOfRange;
                      const isVehicleCompat =
                        primaryVehicle?.connectorType.includes(conn.type) ??
                        true;

                      return (
                        <div
                          key={conn.id}
                          className="flex items-center justify-between gap-3 px-3.5 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                              <span>{conn.type}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-xs tabular-nums text-zinc-600">
                                {conn.powerKw} kW
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs">
                              <span
                                className={
                                  isAvailable
                                    ? 'font-medium text-emerald-700'
                                    : conn.status === 'reserved'
                                      ? 'font-medium text-amber-700'
                                      : 'font-medium text-zinc-500'
                                }
                              >
                                {conn.status === 'available'
                                  ? 'Available'
                                  : conn.status === 'reserved'
                                    ? 'Reserved (30m hold)'
                                    : 'Occupied'}
                              </span>
                              {!isVehicleCompat && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-zinc-400">
                                    Adapter needed
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={
                              !canBookNow || busyConnectorId === conn.id
                            }
                            onClick={() =>
                              handleReserveClick(selectedPoint.id, conn.id)
                            }
                            className={`whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                              canBookNow
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60'
                                : 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                            }`}
                          >
                            {busyConnectorId === conn.id
                              ? 'Reserving...'
                              : !isAvailable
                                ? 'Unavailable'
                                : isSelectedOutOfRange
                                  ? 'Out of 10 km Range'
                                  : 'Reserve 30m'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Verified Reviews */}
                <div className="space-y-3 border-t border-zinc-200 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-900">
                      Driver Reviews
                    </h3>
                    <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-zinc-700">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {selectedPoint.rating.toFixed(1)} ·{' '}
                      {selectedReviews.length} reviews
                    </span>
                  </div>

                  {selectedReviews.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No reviews yet for this charging point.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedReviews.slice(0, 3).map((rev) => (
                        <div
                          key={rev.id}
                          className="border-b border-zinc-100 pb-3 last:border-b-0 last:pb-0"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              {rev.driverName}
                            </span>
                            <span className="font-mono tabular-nums text-zinc-600">
                              {rev.rating}.0 / 5
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                            {rev.comment}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              Select a charging point on the map or list to view details and reserve.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
