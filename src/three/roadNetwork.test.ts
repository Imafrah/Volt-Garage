import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDistanceKm } from '../domain/imchargeEngine';
import { world3DToGeo } from './mapProjection';
import {
  ROAD_NODES,
  findRoadPath,
  isClearOfRoads,
  snapPointToRoad,
  stepManualDrive,
} from './roadNetwork';

test('snapPointToRoad snaps Marienplatz downtown cleanly with bridge elevation on Isar crossings', () => {
  const mp = ROAD_NODES.marienplatz;
  const snap = snapPointToRoad(mp.x, mp.z);
  assert.ok(snap.distance < 0.01);
  assert.equal(snap.y, 0);

  const midBridgeX = (ROAD_NODES.isar_w.x + ROAD_NODES.isar_e.x) * 0.5;
  const midBridgeZ = (ROAD_NODES.isar_w.z + ROAD_NODES.isar_e.z) * 0.5;
  const bridgeSnap = snapPointToRoad(midBridgeX, midBridgeZ);
  assert.equal(bridgeSnap.segment.isBridge, true);
  assert.ok(bridgeSnap.y > 0.15, 'Isar bridge midpoint elevates above river');
});

test('isClearOfRoads prevents buildings from spawning inside asphalt corridors', () => {
  const onRoad = ROAD_NODES.schwabing;
  assert.equal(isClearOfRoads(onRoad.x, onRoad.z), false);
  assert.equal(isClearOfRoads(-32, -32), true);
});

test('findRoadPath builds multi-hop street path across Munich and onto A9 North (>10 km)', () => {
  const start = ROAD_NODES.marienplatz;
  const goal = ROAD_NODES.a9_garching;
  const { waypoints, destinationSnap } = findRoadPath(start, goal);
  assert.ok(waypoints.length >= 4, 'Multi-hop street route has intermediate intersections');
  const last = waypoints[waypoints.length - 1];
  assert.ok(Math.hypot(last.x - destinationSnap.x, last.z - destinationSnap.z) < 0.05);

  const startGeo = world3DToGeo(start);
  const endGeo = world3DToGeo(last);
  const km = calculateDistanceKm(startGeo, endGeo);
  assert.ok(km > 10, `A9 Garching endpoint is outside 10 km geofence (got ${km} km)`);
});

test('stepManualDrive moves the EV forward, turns via steering, and stays inside road corridor', () => {
  const mp = ROAD_NODES.marienplatz;
  let state = {
    x: mp.x,
    z: mp.z,
    yaw: Math.PI, // facing North (-Z) along Ludwigstraße
    speed: 0,
  };

  for (let i = 0; i < 25; i++) {
    const res = stepManualDrive(state, { throttle: 1, steer: 0 }, 0.05);
    state = res.next;
    assert.ok(
      res.snap.distance <= res.snap.segment.width * 0.5 + 0.05,
      'EV remains constrained to drivable road corridor'
    );
  }

  const movedDist = Math.hypot(state.x - mp.x, state.z - mp.z);
  assert.ok(movedDist > 4, 'EV advances smoothly along road when throttle held');

  // Verify steering changes yaw
  const turned = stepManualDrive(state, { throttle: 1, steer: 1 }, 0.05);
  assert.notEqual(turned.next.yaw, state.yaw);
});
