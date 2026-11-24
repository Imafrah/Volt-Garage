import type { Vec3Tuple } from './mapProjection';

export interface RoadNode {
  id: string;
  x: number;
  z: number;
}

export interface RoadSegment {
  id: string;
  name: string;
  from: string;
  to: string;
  width: number;
  isBridge?: boolean;
}

export interface RoadSnapResult {
  x: number;
  y: number;
  z: number;
  segment: RoadSegment;
  t: number;
  distance: number;
  tangentX: number;
  tangentZ: number;
  headingRad: number;
}

export interface ManualDriveState {
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

export interface ManualDriveInput {
  throttle: number; // -1 (reverse) to +1 (forward)
  steer: number; // -1 (right) to +1 (left)
}

/**
 * Connected Munich Metro road graph covering Marienplatz, Altstadt Ring,
 * Maxvorstadt, Schwabing, Olympiapark, Haidhausen (via Isar Bridge),
 * Mittlerer Ring, and the A9 Northbound Corridor (>10 km geofence exit).
 */
export const ROAD_NODES: Record<string, RoadNode> = {
  marienplatz: { id: 'marienplatz', x: -0.6, z: 5.3 },
  odeonsplatz: { id: 'odeonsplatz', x: -0.2, z: -2.4 },
  maxvorstadt: { id: 'maxvorstadt', x: -5.1, z: 2.0 },
  schwabing: { id: 'schwabing', x: 2.4, z: -5.7 },
  schwabing_n: { id: 'schwabing_n', x: 4.5, z: -15.5 },
  olympiapark: { id: 'olympiapark', x: -7.5, z: -11.5 },
  isar_w: { id: 'isar_w', x: 3.4, z: 6.2 },
  isar_e: { id: 'isar_e', x: 7.9, z: 9.6 },
  bogenhausen: { id: 'bogenhausen', x: 22.0, z: 9.5 },
  east_exit: { id: 'east_exit', x: 42.0, z: 10.5 },
  westend: { id: 'westend', x: -16.0, z: 4.5 },
  west_exit: { id: 'west_exit', x: -34.0, z: 6.0 },
  ring_nw: { id: 'ring_nw', x: -15.5, z: -18.5 },
  ring_n: { id: 'ring_n', x: 4.2, z: -22.5 },
  ring_ne: { id: 'ring_ne', x: 18.0, z: -12.0 },
  ring_se: { id: 'ring_se', x: 15.5, z: 18.5 },
  sendling: { id: 'sendling', x: -5.5, z: 17.5 },
  south_exit: { id: 'south_exit', x: -9.0, z: 38.0 },
  a9_mid: { id: 'a9_mid', x: 13.5, z: -32.0 },
  a9_garching: { id: 'a9_garching', x: 21.7, z: -44.5 },
  a9_north: { id: 'a9_north', x: 26.5, z: -54.0 },
};

export const ROAD_SEGMENTS: RoadSegment[] = [
  // Altstadt Inner Ring & Core Connectors
  { id: 'ludwig-south', name: 'Ludwigstraße · Altstadt', from: 'marienplatz', to: 'odeonsplatz', width: 2.8 },
  { id: 'kaufinger', name: 'Neuhauser / Kaufingerstraße', from: 'marienplatz', to: 'maxvorstadt', width: 2.6 },
  { id: 'brienner', name: 'Brienner Straße', from: 'maxvorstadt', to: 'odeonsplatz', width: 2.6 },
  { id: 'leopold-south', name: 'Leopoldstraße', from: 'odeonsplatz', to: 'schwabing', width: 2.8 },
  { id: 'tal-west', name: 'Tal · Isar Gate', from: 'marienplatz', to: 'isar_w', width: 2.7 },
  { id: 'isar-bridge', name: 'Ludwigsbrücke (Isar Bridge)', from: 'isar_w', to: 'isar_e', width: 2.9, isBridge: true },
  { id: 'prinzregenten-link', name: 'Isar East Promenade', from: 'odeonsplatz', to: 'isar_w', width: 2.4 },

  // Schwabing & A9 Autobahn Corridor (crosses 10 km geofence north)
  { id: 'leopold-north', name: 'Leopoldstraße North', from: 'schwabing', to: 'schwabing_n', width: 2.9 },
  { id: 'ring-north-join', name: 'Petuelring Junction', from: 'schwabing_n', to: 'ring_n', width: 3.0 },
  { id: 'a9-south', name: 'A9 Autobahn · Freimann', from: 'ring_n', to: 'a9_mid', width: 3.2 },
  { id: 'a9-garching', name: 'A9 Garching Corridor', from: 'a9_mid', to: 'a9_garching', width: 3.2 },
  { id: 'a9-airport', name: 'A9 Airport Spur (>10 km)', from: 'a9_garching', to: 'a9_north', width: 3.2 },

  // Maxvorstadt / Olympiapark NW Corridor
  { id: 'dachauer-s', name: 'Dachauer Straße', from: 'maxvorstadt', to: 'olympiapark', width: 2.7 },
  { id: 'olympia-ring', name: 'Georg-Brauchle-Ring', from: 'olympiapark', to: 'ring_nw', width: 2.8 },
  { id: 'petuelring-w', name: 'Petuelring West', from: 'ring_nw', to: 'ring_n', width: 2.9 },
  { id: 'schwabing-olympia', name: 'Ackermannstraße', from: 'olympiapark', to: 'schwabing_n', width: 2.5 },

  // Mittlerer Ring Loop & East-West Arterials
  { id: 'landsberger-in', name: 'Landsberger Straße', from: 'westend', to: 'maxvorstadt', width: 2.8 },
  { id: 'west-arterial', name: 'A96 Lindauer Westbound', from: 'west_exit', to: 'westend', width: 3.0 },
  { id: 'mittlerer-w', name: 'Mittlerer Ring West', from: 'westend', to: 'ring_nw', width: 2.9 },
  { id: 'mittlerer-sw', name: 'Mittlerer Ring Southwest', from: 'westend', to: 'sendling', width: 2.9 },
  { id: 'lindwurm', name: 'Lindwurmstraße', from: 'marienplatz', to: 'sendling', width: 2.7 },
  { id: 'a95-south', name: 'A95 Starnberg Southbound', from: 'sendling', to: 'south_exit', width: 3.0 },
  { id: 'mittlerer-se', name: 'Mittlerer Ring South', from: 'sendling', to: 'ring_se', width: 2.9 },
  { id: 'haidhausen-ring', name: 'Innsbrucker Ring', from: 'ring_se', to: 'isar_e', width: 2.8 },
  { id: 'haidhausen-east', name: 'Einstein / Berg-am-Laim', from: 'isar_e', to: 'bogenhausen', width: 2.8 },
  { id: 'a94-east', name: 'A94 Munich Eastbound', from: 'bogenhausen', to: 'east_exit', width: 3.0 },
  { id: 'effner-ring', name: 'Effnerstraße · Ring East', from: 'bogenhausen', to: 'ring_ne', width: 2.9 },
  { id: 'föhrring', name: 'Föhringer Ring (Isar North)', from: 'ring_n', to: 'ring_ne', width: 2.9, isBridge: true },
  { id: 'englischer-east', name: 'Effner · Arabellapark', from: 'schwabing', to: 'ring_ne', width: 2.5 },
];

export const BRIDGE_ROAD_Y = 0.22;

function projectToSegment(
  px: number,
  pz: number,
  seg: RoadSegment
): RoadSnapResult {
  const a = ROAD_NODES[seg.from];
  const b = ROAD_NODES[seg.to];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  const t =
    lenSq > 0
      ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / lenSq))
      : 0;
  const x = a.x + t * dx;
  const z = a.z + t * dz;
  const len = Math.hypot(dx, dz) || 1;
  const tangentX = dx / len;
  const tangentZ = dz / len;
  const y = seg.isBridge ? BRIDGE_ROAD_Y * Math.sin(Math.PI * t) : 0;

  return {
    x,
    y,
    z,
    segment: seg,
    t,
    distance: Math.hypot(px - x, pz - z),
    tangentX,
    tangentZ,
    headingRad: Math.atan2(tangentX, tangentZ),
  };
}

/**
 * Finds the closest point on the Munich road network to any world (x, z) point.
 */
export function snapPointToRoad(x: number, z: number): RoadSnapResult {
  let best = projectToSegment(x, z, ROAD_SEGMENTS[0]);
  for (let i = 1; i < ROAD_SEGMENTS.length; i++) {
    const candidate = projectToSegment(x, z, ROAD_SEGMENTS[i]);
    if (candidate.distance < best.distance) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Returns true if a placement coordinate is safely clear of all roads + curb margin.
 */
export function isClearOfRoads(
  x: number,
  z: number,
  clearanceMargin = 1.6
): boolean {
  const snap = snapPointToRoad(x, z);
  return snap.distance >= snap.segment.width * 0.5 + clearanceMargin;
}

/**
 * Computes shortest street path across the Munich road graph between two world points.
 * Used when the user clicks anywhere on the 3D road map to drive the EV there.
 */
export function findRoadPath(
  startPos: { x: number; z: number },
  goalPos: { x: number; z: number }
): { waypoints: Vec3Tuple[]; destinationSnap: RoadSnapResult } {
  const startSnap = snapPointToRoad(startPos.x, startPos.z);
  const goalSnap = snapPointToRoad(goalPos.x, goalPos.z);

  if (startSnap.segment.id === goalSnap.segment.id) {
    return {
      waypoints: [{ x: goalSnap.x, y: goalSnap.y, z: goalSnap.z }],
      destinationSnap: goalSnap,
    };
  }

  type AdjEdge = { to: string; weight: number };
  const adj = new Map<string, AdjEdge[]>();
  const coords = new Map<string, { x: number; z: number }>();

  const addUndirected = (u: string, v: string, w: number) => {
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u)!.push({ to: v, weight: w });
    adj.get(v)!.push({ to: u, weight: w });
  };

  for (const node of Object.values(ROAD_NODES)) {
    coords.set(node.id, { x: node.x, z: node.z });
  }
  for (const seg of ROAD_SEGMENTS) {
    const a = ROAD_NODES[seg.from];
    const b = ROAD_NODES[seg.to];
    addUndirected(seg.from, seg.to, Math.hypot(b.x - a.x, b.z - a.z));
  }

  const START_KEY = '__START__';
  const GOAL_KEY = '__GOAL__';
  coords.set(START_KEY, { x: startSnap.x, z: startSnap.z });
  coords.set(GOAL_KEY, { x: goalSnap.x, z: goalSnap.z });

  const sA = ROAD_NODES[startSnap.segment.from];
  const sB = ROAD_NODES[startSnap.segment.to];
  addUndirected(
    START_KEY,
    startSnap.segment.from,
    Math.hypot(startSnap.x - sA.x, startSnap.z - sA.z)
  );
  addUndirected(
    START_KEY,
    startSnap.segment.to,
    Math.hypot(startSnap.x - sB.x, startSnap.z - sB.z)
  );

  const gA = ROAD_NODES[goalSnap.segment.from];
  const gB = ROAD_NODES[goalSnap.segment.to];
  addUndirected(
    GOAL_KEY,
    goalSnap.segment.from,
    Math.hypot(goalSnap.x - gA.x, goalSnap.z - gA.z)
  );
  addUndirected(
    GOAL_KEY,
    goalSnap.segment.to,
    Math.hypot(goalSnap.x - gB.x, goalSnap.z - gB.z)
  );

  // Dijkstra
  const dist = new Map<string, number>([[START_KEY, 0]]);
  const prev = new Map<string, string>();
  const unvisited = new Set<string>(coords.keys());

  while (unvisited.size > 0) {
    let current: string | null = null;
    let bestD = Infinity;
    for (const key of unvisited) {
      const d = dist.get(key) ?? Infinity;
      if (d < bestD) {
        bestD = d;
        current = key;
      }
    }
    if (!current || bestD === Infinity) break;
    if (current === GOAL_KEY) break;
    unvisited.delete(current);

    for (const edge of adj.get(current) ?? []) {
      if (!unvisited.has(edge.to)) continue;
      const alt = bestD + edge.weight;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, current);
      }
    }
  }

  const nodeChain: string[] = [];
  let cursor: string | undefined = GOAL_KEY;
  while (cursor) {
    if (cursor !== START_KEY) {
      nodeChain.unshift(cursor);
    }
    cursor = prev.get(cursor);
  }

  const waypoints: Vec3Tuple[] = [];
  for (const key of nodeChain) {
    const c = coords.get(key);
    if (!c) continue;
    // Skip redundant point virtually identical to start
    if (
      waypoints.length === 0 &&
      Math.hypot(c.x - startSnap.x, c.z - startSnap.z) < 0.45
    ) {
      continue;
    }
    const snap = snapPointToRoad(c.x, c.z);
    waypoints.push({ x: c.x, y: snap.y, z: c.z });
  }

  if (waypoints.length === 0) {
    waypoints.push({ x: goalSnap.x, y: goalSnap.y, z: goalSnap.z });
  }

  return { waypoints, destinationSnap: goalSnap };
}

/**
 * Steps manual EV driving physics along the Munich road network.
 * Keeps the car smoothly inside drivable asphalt corridors while permitting
 * natural steering across intersections and turning.
 */
export function stepManualDrive(
  state: ManualDriveState,
  input: ManualDriveInput,
  dt: number
): {
  next: ManualDriveState;
  snap: RoadSnapResult;
  distanceMoved: number;
} {
  const clampedDt = Math.min(0.1, Math.max(0.001, dt));
  const maxForwardSpeed = 14.5; // world units / sec (~3.6 km/s arcade scale for prototype)
  const maxReverseSpeed = -6.5;

  const targetSpeed =
    input.throttle > 0
      ? input.throttle * maxForwardSpeed
      : input.throttle < 0
        ? input.throttle * Math.abs(maxReverseSpeed)
        : 0;

  const accelRate = input.throttle !== 0 ? 5.2 : 6.5;
  const speedBlend = 1 - Math.exp(-accelRate * clampedDt);
  const nextSpeed = state.speed + (targetSpeed - state.speed) * speedBlend;

  const speedFactor = Math.min(1, Math.max(0.35, Math.abs(nextSpeed) / 6));
  const reverseSign = nextSpeed < -0.1 ? -1 : 1;
  const turnRate = 2.45; // rad/s
  let nextYaw =
    state.yaw + input.steer * turnRate * speedFactor * reverseSign * clampedDt;

  const fwdX = Math.sin(nextYaw);
  const fwdZ = Math.cos(nextYaw);
  let nextX = state.x + fwdX * nextSpeed * clampedDt;
  let nextZ = state.z + fwdZ * nextSpeed * clampedDt;

  let snap = snapPointToRoad(nextX, nextZ);
  const maxCorridorOffset = snap.segment.width * 0.48;

  // Soft curb containment: keep EV on drivable road surface
  if (snap.distance > maxCorridorOffset) {
    const pullRatio = maxCorridorOffset / snap.distance;
    nextX = snap.x + (nextX - snap.x) * pullRatio;
    nextZ = snap.z + (nextZ - snap.z) * pullRatio;
    snap = snapPointToRoad(nextX, nextZ);

    // Gently align nose along the road tangent when brushing the curb
    if (Math.abs(input.steer) < 0.05 && Math.abs(nextSpeed) > 0.2) {
      const dot =
        Math.sin(nextYaw) * snap.tangentX + Math.cos(nextYaw) * snap.tangentZ;
      const sign = dot >= 0 ? 1 : -1;
      const roadAngle = Math.atan2(snap.tangentX * sign, snap.tangentZ * sign);
      const diff = Math.atan2(
        Math.sin(roadAngle - nextYaw),
        Math.cos(roadAngle - nextYaw)
      );
      nextYaw += diff * Math.min(1, clampedDt * 5.5);
    }
  } else if (Math.abs(input.steer) < 0.05 && Math.abs(nextSpeed) > 0.5) {
    // Subtle lane-centering assist when cruising straight without steering input
    nextX += (snap.x - nextX) * Math.min(1, clampedDt * 2.1);
    nextZ += (snap.z - nextZ) * Math.min(1, clampedDt * 2.1);
    snap = snapPointToRoad(nextX, nextZ);
  }

  const distanceMoved = Math.hypot(nextX - state.x, nextZ - state.z);
  return {
    next: {
      x: nextX,
      z: nextZ,
      yaw: nextYaw,
      speed: Math.abs(nextSpeed) < 0.02 && input.throttle === 0 ? 0 : nextSpeed,
    },
    snap,
    distanceMoved,
  };
}
