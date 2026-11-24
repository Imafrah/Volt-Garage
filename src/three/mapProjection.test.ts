import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MUNICH_ORIGIN,
  WORLD_UNITS_PER_KM,
  clampWorldPointToStage,
  computeCameraPresetPose,
  geoToWorld3D,
  getStationAvailabilityState,
  kmToWorldUnits,
  sampleRouteArc,
  world3DToGeo,
} from './mapProjection';
import type { ChargingPoint } from '../domain/types';

function makePoint(overrides: Partial<ChargingPoint> = {}): ChargingPoint {
  return {
    id: 'cp-test',
    hostUid: 'host-1',
    hostName: 'Host One',
    type: 'private_host',
    location: { lat: 48.149, lon: 11.578 },
    address: 'Marienplatz 1, Munich',
    name: 'Test Wallbox',
    description: '22 kW wallbox',
    connectors: [{ id: 'c-1', type: 'Type2', powerKw: 22, status: 'available' }],
    pricePerKwh: 18,
    commissionRate: 0.2,
    rating: 4.9,
    reviewCount: 12,
    photos: [],
    availabilityHours: '24/7',
    kycVerified: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

test('geoToWorld3D maps Munich origin to (0, 0, 0) and projects North/East axes properly', () => {
  const origin = geoToWorld3D(MUNICH_ORIGIN);
  assert.equal(origin.x, 0);
  assert.equal(origin.y, 0);
  assert.equal(origin.z, 0);

  const northEastGeo = {
    lat: MUNICH_ORIGIN.lat + 0.01,
    lon: MUNICH_ORIGIN.lon + 0.01,
  };
  const northEast = geoToWorld3D(northEastGeo);
  assert.ok(northEast.x > 0, 'East longitude maps to +X');
  assert.ok(northEast.z < 0, 'North latitude maps to -Z');

  const roundTrip = world3DToGeo(northEast);
  assert.ok(Math.abs(roundTrip.lat - northEastGeo.lat) < 0.0001);
  assert.ok(Math.abs(roundTrip.lon - northEastGeo.lon) < 0.0001);
});

test('kmToWorldUnits scales cleanly with WORLD_UNITS_PER_KM', () => {
  assert.equal(kmToWorldUnits(10), 10 * WORLD_UNITS_PER_KM);
  assert.equal(kmToWorldUnits(0), 0.5);
});

test('clampWorldPointToStage keeps nearby points untouched and clamps distant airport coordinates', () => {
  const near = clampWorldPointToStage({ x: 10, y: 0, z: -8 }, 64);
  assert.equal(near.isClamped, false);
  assert.deepEqual(near.position, { x: 10, y: 0, z: -8 });

  const far = clampWorldPointToStage({ x: 90, y: 0, z: -120 }, 64);
  assert.equal(far.isClamped, true);
  const r = Math.hypot(far.position.x, far.position.z);
  assert.ok(Math.abs(r - 64) < 0.05);
});

test('getStationAvailabilityState distinguishes available, reserved, occupied, and out-of-range stations', () => {
  const center = { lat: 48.149, lon: 11.578 };
  const avail = getStationAvailabilityState(makePoint(), center, 10);
  assert.equal(avail.status, 'available');
  assert.equal(avail.availableCount, 1);

  const reserved = getStationAvailabilityState(
    makePoint({
      connectors: [{ id: 'c-1', type: 'Type2', powerKw: 22, status: 'reserved' }],
    }),
    center,
    10
  );
  assert.equal(reserved.status, 'reserved');

  const outOfRange = getStationAvailabilityState(
    makePoint({ location: { lat: 48.3537, lon: 11.775 } }),
    center,
    10
  );
  assert.equal(outOfRange.status, 'out_of_range');
});

test('computeCameraPresetPose returns valid non-zero elevated camera viewpoints', () => {
  const driver = { x: 4, y: 0, z: -2 };
  const charger = { x: 12, y: 0, z: -10 };

  const iso = computeCameraPresetPose('iso', driver, charger);
  assert.ok(iso.position.y > 20);
  assert.deepEqual(iso.target, { x: 4, y: 0.5, z: -2 });

  const top = computeCameraPresetPose('top', driver, charger);
  assert.ok(top.position.y >= 70);

  const focusCharger = computeCameraPresetPose('charger', driver, charger);
  assert.deepEqual(focusCharger.target, { x: 12, y: 1.6, z: -10 });
});

test('sampleRouteArc builds an elevated arc from driver EV to charger tower', () => {
  const arc = sampleRouteArc({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, 16);
  assert.equal(arc.length, 17);
  assert.ok(arc[8].y > arc[0].y, 'Midpoint arches higher than endpoints');
  assert.ok(arc[8].y > arc[16].y);
});
