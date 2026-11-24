import { calculateDistanceKm } from '../domain/imchargeEngine';
import type { ChargingPoint, GeoPoint } from '../domain/types';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export type MapCameraPreset = 'iso' | 'top' | 'driver' | 'charger';

// Munich downtown reference origin (Marienplatz / Altstadt center)
export const MUNICH_ORIGIN: GeoPoint = {
  lat: 48.149,
  lon: 11.578,
};

// 1 world unit = 125 meters => 8 world units = 1 km (10 km geofence = 80 units, bounded cleanly)
// Wait: let's keep world scale compact & camera-friendly: 1 km = 4.0 world units.
// Then 10 km geofence radius = 40 world units, typical 2-5 km Munich stations sit 8-20 units apart.
export const WORLD_UNITS_PER_KM = 4.0;
const KM_PER_DEG_LAT = 111.32;
const KM_PER_DEG_LON_AT_MUNICH = 74.2; // 111.32 * cos(48.15 deg)

/**
 * Converts a Munich lat/lon coordinate to Three.js world space (X = East, Z = South).
 */
export function geoToWorld3D(geo: GeoPoint): Vec3Tuple {
  const dLonKm = (geo.lon - MUNICH_ORIGIN.lon) * KM_PER_DEG_LON_AT_MUNICH;
  const dLatKm = (geo.lat - MUNICH_ORIGIN.lat) * KM_PER_DEG_LAT;
  return {
    x: Number((dLonKm * WORLD_UNITS_PER_KM).toFixed(3)),
    y: 0,
    z: Number((-dLatKm * WORLD_UNITS_PER_KM).toFixed(3)),
  };
}

/**
 * Converts Three.js world space (X = East, Z = South) back to Munich lat/lon.
 */
export function world3DToGeo(world: { x: number; z: number }): GeoPoint {
  const dLonKm = world.x / WORLD_UNITS_PER_KM;
  const dLatKm = -world.z / WORLD_UNITS_PER_KM;
  return {
    lat: Number((MUNICH_ORIGIN.lat + dLatKm / KM_PER_DEG_LAT).toFixed(6)),
    lon: Number((MUNICH_ORIGIN.lon + dLonKm / KM_PER_DEG_LON_AT_MUNICH).toFixed(6)),
  };
}

/**
 * Clamps extreme coordinates (e.g. airport 29 km away) onto a visual outer perimeter
 * while preserving bearing so the driver EV stays visible on the city horizon stage.
 */
export function clampWorldPointToStage(
  point: Vec3Tuple,
  maxRadiusUnits = 64
): { position: Vec3Tuple; isClamped: boolean } {
  const r = Math.hypot(point.x, point.z);
  if (r <= maxRadiusUnits || r === 0) {
    return { position: point, isClamped: false };
  }
  const scale = maxRadiusUnits / r;
  return {
    position: {
      x: Number((point.x * scale).toFixed(3)),
      y: point.y,
      z: Number((point.z * scale).toFixed(3)),
    },
    isClamped: true,
  };
}

export function kmToWorldUnits(km: number): number {
  return Math.max(0.5, km * WORLD_UNITS_PER_KM);
}

export function getStationAvailabilityState(
  point: ChargingPoint,
  driverLocation: GeoPoint,
  geofenceKm: number
): {
  status: 'available' | 'reserved' | 'occupied' | 'out_of_range';
  availableCount: number;
  distanceKm: number;
  colorHex: number;
} {
  const availableCount = point.connectors.filter(
    (c) => c.status === 'available'
  ).length;
  const reservedCount = point.connectors.filter(
    (c) => c.status === 'reserved'
  ).length;
  const distanceKm = calculateDistanceKm(driverLocation, point.location);
  const outOfRange = distanceKm > geofenceKm;

  if (outOfRange) {
    return {
      status: 'out_of_range',
      availableCount,
      distanceKm,
      colorHex: 0x94a3b8,
    };
  }
  if (availableCount > 0) {
    return {
      status: 'available',
      availableCount,
      distanceKm,
      colorHex: 0x059669,
    };
  }
  if (reservedCount > 0) {
    return {
      status: 'reserved',
      availableCount,
      distanceKm,
      colorHex: 0xd97706,
    };
  }
  return {
    status: 'occupied',
    availableCount,
    distanceKm,
    colorHex: 0x64748b,
  };
}

export function computeCameraPresetPose(
  preset: MapCameraPreset,
  driverPos: Vec3Tuple,
  chargerPos: Vec3Tuple | null
): { position: Vec3Tuple; target: Vec3Tuple } {
  switch (preset) {
    case 'top':
      return {
        position: { x: driverPos.x, y: 74, z: driverPos.z + 8 },
        target: { x: driverPos.x, y: 0, z: driverPos.z },
      };
    case 'driver':
      return {
        position: {
          x: driverPos.x - 12,
          y: 11,
          z: driverPos.z + 16,
        },
        target: { x: driverPos.x, y: 1.2, z: driverPos.z },
      };
    case 'charger': {
      const focus = chargerPos ?? driverPos;
      return {
        position: {
          x: focus.x + 11,
          y: 9.5,
          z: focus.z + 14,
        },
        target: { x: focus.x, y: 1.6, z: focus.z },
      };
    }
    case 'iso':
    default:
      return {
        position: {
          x: driverPos.x + 22,
          y: 32,
          z: driverPos.z + 38,
        },
        target: { x: driverPos.x, y: 0.5, z: driverPos.z },
      };
  }
}

/**
 * Generates quadratic Bezier route arc samples between driver EV and target station.
 */
export function sampleRouteArc(
  start: Vec3Tuple,
  end: Vec3Tuple,
  segments = 24
): Vec3Tuple[] {
  const dist = Math.hypot(end.x - start.x, end.z - start.z);
  const peakY = Math.min(10, Math.max(2.2, dist * 0.24));
  const midX = (start.x + end.x) * 0.5;
  const midZ = (start.z + end.z) * 0.5;

  const pts: Vec3Tuple[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const inv = 1 - t;
    pts.push({
      x: inv * inv * start.x + 2 * inv * t * midX + t * t * end.x,
      y: inv * inv * (start.y + 0.65) + 2 * inv * t * peakY + t * t * (end.y + 1.8),
      z: inv * inv * start.z + 2 * inv * t * midZ + t * t * end.z,
    });
  }
  return pts;
}
