import * as THREE from 'three';
import type { ChargingPoint } from '../domain/types';
import {
  BRIDGE_ROAD_Y,
  ROAD_NODES,
  ROAD_SEGMENTS,
  isClearOfRoads,
} from './roadNetwork';
import { createOledScreenTexture } from './webglUtils';

/**
 * Builds an 8-part composite EV crossover/sedan pivoted at bottom-center (y = 0).
 */
export function buildEvVehicleGroup(
  shadowTexture: THREE.Texture,
  isSoftwareGl: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'DriverEV';

  // 1. Contact shadow disc grounded at y = 0.02
  const shadowGeo = new THREE.CircleGeometry(1.55, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.02;
  group.add(shadowMesh);

  // 2. Dark matte rocker skirt
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.12,
  });
  const skirtMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.24, 2.9),
    skirtMat
  );
  skirtMesh.position.y = 0.3;
  skirtMesh.castShadow = true;
  group.add(skirtMesh);

  // 3. Sculpted extruded lower chassis hull
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.52, 0.22);
  bodyShape.lineTo(1.52, 0.22);
  bodyShape.lineTo(1.45, 0.56);
  bodyShape.lineTo(0.85, 0.68);
  bodyShape.lineTo(-1.25, 0.68);
  bodyShape.lineTo(-1.5, 0.48);
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.32,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -0.66);
  bodyGeo.rotateY(Math.PI / 2); // Align +Z forward

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.22,
    metalness: 0.55,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });
  const hullMesh = new THREE.Mesh(bodyGeo, bodyMat);
  hullMesh.position.y = 0.14;
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  group.add(hullMesh);

  // 4. Aerodynamic tinted glass canopy
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-0.92, 0.64);
  cabinShape.lineTo(0.78, 0.64);
  cabinShape.lineTo(0.36, 1.06);
  cabinShape.lineTo(-0.56, 1.06);
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.08,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  cabinGeo.translate(0, 0, -0.54);
  cabinGeo.rotateY(Math.PI / 2);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 0.78,
    clearcoat: 1.0,
  });
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.position.y = 0.14;
  cabinMesh.castShadow = true;
  group.add(cabinMesh);

  // 5. Four wheels with matte rubber tires + metallic alloy rims
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.24,
    metalness: 0.85,
  });
  const tireGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.22, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.24, 14);
  rimGeo.rotateZ(Math.PI / 2);

  const wheelOffsets: [number, number][] = [
    [-0.72, 0.96],
    [0.72, 0.96],
    [-0.72, -0.96],
    [0.72, -0.96],
  ];
  const wheelPivots: THREE.Group[] = [];
  for (const [wx, wz] of wheelOffsets) {
    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(wx, 0.29, wz);

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    wheelPivot.add(tire);

    const rim = new THREE.Mesh(rimGeo, rimMat);
    wheelPivot.add(rim);

    group.add(wheelPivot);
    wheelPivots.push(wheelPivot);
  }
  group.userData.wheels = wheelPivots;

  // 6. Front & Rear LED light bars
  const frontLedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  const frontBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.07, 0.06),
    frontLedMat
  );
  frontBar.position.set(0, 0.56, 1.54);
  group.add(frontBar);

  const rearLedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  const rearBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.12, 0.06, 0.06),
    rearLedMat
  );
  rearBar.position.set(0, 0.62, -1.52);
  group.add(rearBar);

  // 7. Roof telemetry/GPS beacon fin
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x059669,
    emissiveIntensity: 1.1,
    roughness: 0.25,
    metalness: 0.3,
  });
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.15, 0.14, 14),
    beaconMat
  );
  beacon.position.set(0, 1.26, -0.15);
  group.add(beacon);

  return group;
}

export interface ChargerTowerRefs {
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  towerBody: THREE.Group;
}

/**
 * Builds a 6-9 part composite charging station tower/hub pivoted at bottom-center (y = 0).
 */
export function buildChargerTowerGroup(
  point: ChargingPoint,
  shadowTexture: THREE.Texture,
  statusColorHex: number,
  isSelected: boolean
): ChargerTowerRefs {
  const group = new THREE.Group();
  group.name = `Charger-${point.id}`;

  const towerBody = new THREE.Group();
  group.add(towerBody);

  // 1. Contact shadow disc
  const shadowGeo = new THREE.CircleGeometry(1.65, 22);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.02;
  group.add(shadowDisc);

  // 2. Interactive selection / hover ring (with polygonOffset to avoid Z-fighting)
  const ringGeo = new THREE.RingGeometry(1.22, 1.56, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isSelected ? 0x0f172a : statusColorHex,
    transparent: true,
    opacity: isSelected ? 0.92 : 0.42,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.04;
  group.add(ringMesh);

  // 3. Chamfered concrete mounting plinth
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.85,
    metalness: 0.05,
  });
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.08, 0.28, 8),
    plinthMat
  );
  plinth.position.y = 0.14;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  towerBody.add(plinth);

  const isHub = point.type === 'existing_station';
  const columnHeight = isHub ? 2.55 : 1.95;

  // 4. Anodized aluminum charging pedestal column
  const columnMat = new THREE.MeshStandardMaterial({
    color: isHub ? 0x1e293b : 0xf8fafc,
    roughness: 0.34,
    metalness: isHub ? 0.58 : 0.32,
  });
  const column = new THREE.Mesh(
    new THREE.BoxGeometry(isHub ? 0.82 : 0.56, columnHeight, 0.46),
    columnMat
  );
  column.position.y = 0.28 + columnHeight / 2;
  column.castShadow = true;
  column.receiveShadow = true;
  towerBody.add(column);

  // 5. Recessed front OLED meter screen face
  const maxKw = Math.max(...point.connectors.map((c) => c.powerKw));
  const screenTex = createOledScreenTexture(
    `₹${point.pricePerKwh.toFixed(1)}`,
    `${maxKw} kW ${point.connectors[0]?.type ?? 'Type2'}`,
    statusColorHex === 0x059669
      ? '#10b981'
      : statusColorHex === 0xd97706
        ? '#f59e0b'
        : '#94a3b8'
  );
  const screenMat = new THREE.MeshStandardMaterial({
    map: screenTex,
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.1,
    emissive: 0x0f172a,
    emissiveIntensity: 0.25,
  });
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(isHub ? 0.62 : 0.42, 0.42),
    screenMat
  );
  screenMesh.position.set(0, 0.28 + columnHeight * 0.66, 0.24);
  towerBody.add(screenMesh);

  // 6. Status collar & top LED beacon dome
  const beaconMat = new THREE.MeshStandardMaterial({
    color: statusColorHex,
    emissive: statusColorHex,
    emissiveIntensity: isSelected ? 1.45 : 0.9,
    roughness: 0.2,
    metalness: 0.25,
  });
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(isHub ? 0.88 : 0.62, 0.16, 0.52),
    beaconMat
  );
  collar.position.y = 0.28 + columnHeight + 0.06;
  towerBody.add(collar);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    beaconMat
  );
  dome.position.y = 0.28 + columnHeight + 0.14;
  towerBody.add(dome);

  // 7. Side cable holster + coiled TubeGeometry cable arc
  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(isHub ? 0.44 : 0.3, 1.35, 0.08),
    new THREE.Vector3(isHub ? 0.78 : 0.58, 0.95, 0.22),
    new THREE.Vector3(isHub ? 0.68 : 0.5, 0.52, 0.0),
    new THREE.Vector3(isHub ? 0.42 : 0.28, 0.85, -0.14),
  ]);
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.72,
    metalness: 0.1,
  });
  const cableMesh = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 14, 0.048, 8, false),
    cableMat
  );
  towerBody.add(cableMesh);

  // 8. Architectural canopy wing for Partner Fast-Charge Hubs
  if (isHub) {
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.35,
      metalness: 0.5,
    });
    const canopyWing = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.14, 1.6),
      canopyMat
    );
    canopyWing.position.set(0, 3.35, 0.35);
    canopyWing.rotation.x = -0.08;
    canopyWing.castShadow = true;
    towerBody.add(canopyWing);

    const solarPanel = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.05, 1.35),
      new THREE.MeshStandardMaterial({
        color: 0x1e3a5f,
        roughness: 0.18,
        metalness: 0.75,
      })
    );
    solarPanel.position.set(0, 3.44, 0.35);
    solarPanel.rotation.x = -0.08;
    towerBody.add(solarPanel);
  }

  // 9. Simplified invisible raycast hit mesh on layer 1
  const hitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 3.9, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.y = 1.9;
  hitMesh.layers.set(1);
  hitMesh.userData.chargingPointId = point.id;
  group.add(hitMesh);

  return {
    group,
    hitMesh,
    beaconMat,
    ringMesh,
    ringMat,
    towerBody,
  };
}

/**
 * Builds stylized Munich urban context: textured ground plane, Isar River ribbon,
 * Englischer Garten / Olympiapark greens, and instanced low-poly district buildings.
 */
export function buildMunichUrbanContext(
  gridTextures: { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }
): THREE.Group {
  const envGroup = new THREE.Group();
  envGroup.name = 'MunichUrbanContext';

  // Ground plane (Y = 0)
  const groundGeo = new THREE.PlaneGeometry(240, 240, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: gridTextures.map,
    roughnessMap: gridTextures.roughnessMap,
    roughness: 0.88,
    metalness: 0.04,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  envGroup.add(ground);

  // Green parks (offset Y = +0.02, positioned away from core arterial intersections)
  const parkMat = new THREE.MeshStandardMaterial({
    color: 0xb7dec8,
    roughness: 0.92,
    metalness: 0.0,
  });
  const park1Geo = new THREE.CylinderGeometry(8.5, 8.5, 0.035, 28);
  park1Geo.scale(0.85, 1, 1.45);
  const englischerGarten = new THREE.Mesh(park1Geo, parkMat);
  englischerGarten.position.set(11.5, 0.018, -11.5);
  englischerGarten.receiveShadow = true;
  envGroup.add(englischerGarten);

  const park2Geo = new THREE.CylinderGeometry(7.5, 7.5, 0.035, 28);
  park2Geo.scale(1.2, 1, 0.85);
  const olympiapark = new THREE.Mesh(park2Geo, parkMat);
  olympiapark.position.set(-18, 0.018, -9);
  olympiapark.receiveShadow = true;
  envGroup.add(olympiapark);

  // Isar River curved water ribbon (offset Y = +0.04)
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 0.04, 62),
    new THREE.Vector3(2.5, 0.04, 24),
    new THREE.Vector3(5.6, 0.04, 8),
    new THREE.Vector3(9.5, 0.04, -12),
    new THREE.Vector3(14, 0.04, -30),
    new THREE.Vector3(22, 0.04, -62),
  ]);
  const riverGeo = new THREE.TubeGeometry(riverCurve, 44, 2.1, 6, false);
  riverGeo.scale(1, 0.07, 1);
  const riverMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    roughness: 0.16,
    metalness: 0.15,
    clearcoat: 0.85,
  });
  const riverMesh = new THREE.Mesh(riverGeo, riverMat);
  riverMesh.position.y = 0.035;
  envGroup.add(riverMesh);

  // Connected Munich 3D Asphalt Road Network + Lane Markings + Isar Bridges
  const roadsGroup = new THREE.Group();
  roadsGroup.name = 'MunichRoadNetwork';

  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.86,
    metalness: 0.06,
  });
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.82,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const laneMarkMat = new THREE.MeshBasicMaterial({
    color: 0xf8fafc,
    transparent: true,
    opacity: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const bridgeRailMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.35,
    metalness: 0.65,
  });

  // Junction asphalt discs so intersections blend cleanly without seams
  const nodeMaxWidth = new Map<string, number>();
  for (const seg of ROAD_SEGMENTS) {
    nodeMaxWidth.set(
      seg.from,
      Math.max(nodeMaxWidth.get(seg.from) ?? 0, seg.width)
    );
    nodeMaxWidth.set(
      seg.to,
      Math.max(nodeMaxWidth.get(seg.to) ?? 0, seg.width)
    );
  }
  for (const node of Object.values(ROAD_NODES)) {
    const w = nodeMaxWidth.get(node.id) ?? 2.6;
    const curbDiscGeo = new THREE.CylinderGeometry(
      w * 0.5 + 0.28,
      w * 0.5 + 0.34,
      0.04,
      18
    );
    const curbDisc = new THREE.Mesh(curbDiscGeo, curbMat);
    curbDisc.position.set(node.x, 0.025, node.z);
    curbDisc.receiveShadow = true;
    roadsGroup.add(curbDisc);

    const roadDiscGeo = new THREE.CylinderGeometry(w * 0.5, w * 0.5, 0.05, 18);
    const roadDisc = new THREE.Mesh(roadDiscGeo, asphaltMat);
    roadDisc.position.set(node.x, 0.032, node.z);
    roadDisc.receiveShadow = true;
    roadsGroup.add(roadDisc);
  }

  // Road segments + center lane dashes + raised bridges over Isar
  const dashGeo = new THREE.BoxGeometry(0.13, 0.015, 0.95);
  const dashEntries: { x: number; y: number; z: number; yaw: number }[] = [];

  for (const seg of ROAD_SEGMENTS) {
    const a = ROAD_NODES[seg.from];
    const b = ROAD_NODES[seg.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const midX = (a.x + b.x) * 0.5;
    const midZ = (a.z + b.z) * 0.5;

    if (seg.isBridge) {
      // Multi-span arched bridge deck over the Isar River
      const spans = 6;
      const spanLen = len / spans;
      for (let s = 0; s < spans; s++) {
        const t = (s + 0.5) / spans;
        const sx = a.x + dx * t;
        const sz = a.z + dz * t;
        const sy = 0.05 + BRIDGE_ROAD_Y * Math.sin(Math.PI * t);
        const slopeAngle = Math.atan2(
          BRIDGE_ROAD_Y * Math.PI * Math.cos(Math.PI * t),
          len
        );

        const deck = new THREE.Mesh(
          new THREE.BoxGeometry(seg.width + 0.45, 0.14, spanLen + 0.14),
          curbMat
        );
        deck.position.set(sx, sy, sz);
        deck.rotation.order = 'YXZ';
        deck.rotation.y = yaw;
        deck.rotation.x = -slopeAngle;
        deck.castShadow = true;
        deck.receiveShadow = true;
        roadsGroup.add(deck);

        const roadTop = new THREE.Mesh(
          new THREE.BoxGeometry(seg.width, 0.04, spanLen + 0.14),
          asphaltMat
        );
        roadTop.position.set(sx, sy + 0.065, sz);
        roadTop.rotation.order = 'YXZ';
        roadTop.rotation.y = yaw;
        roadTop.rotation.x = -slopeAngle;
        roadTop.receiveShadow = true;
        roadsGroup.add(roadTop);

        // Bridge steel guardrails
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.24, spanLen + 0.1),
            bridgeRailMat
          );
          const nx = Math.cos(yaw) * (seg.width * 0.5 + 0.14) * side;
          const nz = -Math.sin(yaw) * (seg.width * 0.5 + 0.14) * side;
          rail.position.set(sx + nx, sy + 0.18, sz + nz);
          rail.rotation.order = 'YXZ';
          rail.rotation.y = yaw;
          rail.rotation.x = -slopeAngle;
          roadsGroup.add(rail);
        }
      }
    } else {
      const curbMesh = new THREE.Mesh(
        new THREE.BoxGeometry(seg.width + 0.56, 0.04, len),
        curbMat
      );
      curbMesh.position.set(midX, 0.025, midZ);
      curbMesh.rotation.y = yaw;
      curbMesh.receiveShadow = true;
      roadsGroup.add(curbMesh);

      const asphaltMesh = new THREE.Mesh(
        new THREE.BoxGeometry(seg.width, 0.05, len),
        asphaltMat
      );
      asphaltMesh.position.set(midX, 0.032, midZ);
      asphaltMesh.rotation.y = yaw;
      asphaltMesh.receiveShadow = true;
      roadsGroup.add(asphaltMesh);
    }

    // Center dashed lane markings
    const step = 2.1;
    const count = Math.max(1, Math.floor((len - 1.2) / step));
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      const bx = a.x + dx * t;
      const bz = a.z + dz * t;
      const by = seg.isBridge
        ? 0.05 + BRIDGE_ROAD_Y * Math.sin(Math.PI * t) + 0.092
        : 0.062;
      dashEntries.push({ x: bx, y: by, z: bz, yaw });
    }
  }

  if (dashEntries.length > 0) {
    const dashInstanced = new THREE.InstancedMesh(
      dashGeo,
      laneMarkMat,
      dashEntries.length
    );
    const dashDummy = new THREE.Object3D();
    dashEntries.forEach((d, idx) => {
      dashDummy.position.set(d.x, d.y, d.z);
      dashDummy.rotation.set(0, d.yaw, 0);
      dashDummy.updateMatrix();
      dashInstanced.setMatrixAt(idx, dashDummy.matrix);
    });
    dashInstanced.instanceMatrix.needsUpdate = true;
    dashInstanced.computeBoundingSphere();
    roadsGroup.add(dashInstanced);
  }
  envGroup.add(roadsGroup);

  // Instanced architectural city blocks around Munich districts (strictly clear of roads)
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  blockGeo.translate(0, 0.5, 0); // Bottom-center pivot
  const blockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.08,
  });
  const blocks: { x: number; z: number; sx: number; sy: number; sz: number; tint: number }[] = [];
  const palette = [0xdde5ef, 0xd1dce8, 0xe2e8f0, 0xcbd5e1];

  for (let i = 0; i < 110 && blocks.length < 64; i++) {
    const angle = (i * 137.5 * Math.PI) / 180;
    const radius = 8 + ((i * 7.3) % 48);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Leave Isar River corridor clear
    if (Math.abs(x - (-0.28 * z + 7)) < 4.5) continue;
    const sx = 2.0 + ((i * 17) % 10) * 0.22;
    const sz = 2.0 + ((i * 23) % 10) * 0.22;
    const halfSpan = Math.max(sx, sz) * 0.5 + 1.25;
    if (!isClearOfRoads(x, z, halfSpan)) continue;

    const sy = 1.4 + ((i * 13) % 10) * 0.48;
    blocks.push({
      x,
      z,
      sx,
      sy,
      sz,
      tint: palette[i % palette.length],
    });
  }

  const instanced = new THREE.InstancedMesh(blockGeo, blockMat, blocks.length);
  instanced.castShadow = true;
  instanced.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  blocks.forEach((b, idx) => {
    dummy.position.set(b.x, 0, b.z);
    dummy.rotation.y = (idx % 4) * (Math.PI / 12);
    dummy.scale.set(b.sx, b.sy, b.sz);
    dummy.updateMatrix();
    instanced.setMatrixAt(idx, dummy.matrix);
    color.setHex(b.tint);
    instanced.setColorAt(idx, color);
  });
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  instanced.computeBoundingSphere();
  envGroup.add(instanced);

  return envGroup;
}
