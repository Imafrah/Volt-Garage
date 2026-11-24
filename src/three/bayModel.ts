import * as THREE from 'three';
import type { ChargingPoint } from '../domain/types';
import { createOledScreenTexture } from './webglUtils';

export interface BaySubsystemInfo {
  id: 'core' | 'meter' | 'shell' | 'cable' | 'inlet';
  label: string;
  spec: string;
}

export interface ChargerBayTwinRefs {
  root: THREE.Group;
  outerShell: THREE.Group;
  displayModule: THREE.Group;
  internalCore: THREE.Group;
  meterModule: THREE.Group;
  cableAssembly: THREE.Group;
  pulseSphere: THREE.Mesh;
  pulseMat: THREE.MeshStandardMaterial;
  cableCurve: THREE.CatmullRomCurve3;
  interactables: THREE.Mesh[];
  subsystemMap: Map<THREE.Mesh, BaySubsystemInfo>;
  bayLampMat: THREE.MeshStandardMaterial;
  groundMat: THREE.MeshStandardMaterial;
}

export function buildChargerBayTwin(
  point: ChargingPoint,
  shadowTexture: THREE.Texture,
  isSoftwareGl: boolean
): ChargerBayTwinRefs {
  const root = new THREE.Group();
  root.name = 'ChargerBayTwin';

  const maxKw = Math.max(...point.connectors.map((c) => c.powerKw));
  const primaryConn = point.connectors[0]?.type ?? 'Type2';
  const isHub = point.type === 'existing_station';
  const isAvailable = point.connectors.some((c) => c.status === 'available');

  const interactables: THREE.Mesh[] = [];
  const subsystemMap = new Map<THREE.Mesh, BaySubsystemInfo>();

  const registerHitPart = (
    mesh: THREE.Mesh,
    info: BaySubsystemInfo
  ) => {
    mesh.layers.enable(1);
    interactables.push(mesh);
    subsystemMap.set(mesh, info);
  };

  // 1. Bay Ground Pad (Y = 0)
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xdbe3ed,
    roughness: 0.88,
    metalness: 0.04,
  });
  const groundGeo = new THREE.PlaneGeometry(40, 40, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  root.add(ground);

  // Concrete station pad (offset +0.025 Y)
  const padMesh = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.08, 5.2),
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.82,
      metalness: 0.08,
    })
  );
  padMesh.position.set(0, 0.04, 0.2);
  padMesh.receiveShadow = true;
  root.add(padMesh);

  // Painted emerald bay perimeter stripe (offset +0.015 above pad with polygonOffset)
  const stripeMat = new THREE.MeshStandardMaterial({
    color: isAvailable ? 0x059669 : 0xd97706,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const stripeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 4.4), stripeMat);
  stripeLeft.position.set(-2.9, 0.088, 0.35);
  root.add(stripeLeft);
  const stripeRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 4.4), stripeMat);
  stripeRight.position.set(2.9, 0.088, 0.35);
  root.add(stripeRight);

  // Contact shadows under charger and parked EV nose
  const chargerShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  chargerShadow.position.set(-1.35, 0.095, -0.6);
  root.add(chargerShadow);

  const evShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  evShadow.position.set(1.05, 0.095, 0.55);
  root.add(evShadow);

  // 2. Charger Unit Base & Rear Anchor Spine (centered at X = -1.35, Z = -0.6)
  const chargerOrigin = new THREE.Group();
  chargerOrigin.position.set(-1.35, 0.08, -0.6);
  root.add(chargerOrigin);

  const anchorPlate = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.14, 0.86),
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.52,
      metalness: 0.72,
    })
  );
  anchorPlate.position.y = 0.07;
  anchorPlate.castShadow = true;
  chargerOrigin.add(anchorPlate);

  const rearSpine = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 2.25, 0.14),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.48,
      metalness: 0.65,
    })
  );
  rearSpine.position.set(0, 1.24, -0.24);
  rearSpine.castShadow = true;
  chargerOrigin.add(rearSpine);

  // 3. Internal Power Core (slides subtly upward on explode)
  const internalCore = new THREE.Group();
  chargerOrigin.add(internalCore);

  const inverterBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.92, 0.34),
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.38,
      metalness: 0.78,
    })
  );
  inverterBlock.position.set(0, 0.72, 0.0);
  inverterBlock.castShadow = true;
  internalCore.add(inverterBlock);
  registerHitPart(inverterBlock, {
    id: 'core',
    label: isHub ? 'SiC DC Power Rectifier Stack' : 'AC Wallbox Contactor Core',
    spec: `${maxKw} kW continuous · 96.4% conversion efficiency`,
  });

  // Copper DC busbars
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.22,
    metalness: 0.92,
  });
  for (const bx of [-0.18, 0, 0.18]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.04), copperMat);
    bar.position.set(bx, 0.74, 0.2);
    internalCore.add(bar);
  }

  // 4. Smart Meter & OCPP Telemetry Board (slides to the side on explode)
  const meterModule = new THREE.Group();
  chargerOrigin.add(meterModule);

  const meterPcb = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.42, 0.1),
    new THREE.MeshStandardMaterial({
      color: 0x065f46,
      roughness: 0.45,
      metalness: 0.25,
    })
  );
  meterPcb.position.set(0, 1.54, 0.04);
  meterModule.add(meterPcb);
  registerHitPart(meterPcb, {
    id: 'meter',
    label: 'MID Smart Meter & OCPP 2.0.1 Gateway',
    spec: point.meterSerialNumber
      ? `Serial ${point.meterSerialNumber} · Wh pulse telemetry`
      : 'OCPI 2.2 / OCPP 2.0.1 live meter stream',
  });

  // 5. Outer Brushed Aluminum Housing Shell (lifts upward on explode)
  const outerShell = new THREE.Group();
  chargerOrigin.add(outerShell);

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: isHub ? 0x1e293b : 0xf1f5f9,
    roughness: 0.28,
    metalness: isHub ? 0.52 : 0.35,
    clearcoat: 0.45,
  });

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.22, 0.56), shellMat);
  leftWall.position.set(-0.43, 1.24, 0.04);
  leftWall.castShadow = true;
  outerShell.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.22, 0.56), shellMat);
  rightWall.position.set(0.43, 1.24, 0.04);
  rightWall.castShadow = true;
  outerShell.add(rightWall);

  const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.14, 0.62), shellMat);
  topCap.position.set(0, 2.4, 0.05);
  topCap.castShadow = true;
  outerShell.add(topCap);
  registerHitPart(topCap, {
    id: 'shell',
    label: 'IP54 Anodized Aluminum Enclosure',
    spec: isHub ? 'Weatherproof DC cabinet + active cooling' : 'Compact residential IP54 housing',
  });

  // Status beacon strip on top cap
  const bayLampMat = new THREE.MeshStandardMaterial({
    color: isAvailable ? 0x10b981 : 0xf59e0b,
    emissive: isAvailable ? 0x059669 : 0xd97706,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  const lampStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.08, 0.52),
    bayLampMat
  );
  lampStrip.position.set(0, 2.5, 0.05);
  outerShell.add(lampStrip);

  // 6. Front Tempered Glass & OLED Bezel (slides forward +Z on explode)
  const displayModule = new THREE.Group();
  chargerOrigin.add(displayModule);

  const frontDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 2.15, 0.06),
    new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.16,
      metalness: 0.35,
      clearcoat: 1.0,
      transparent: true,
      opacity: isSoftwareGl ? 0.92 : 0.96,
    })
  );
  frontDoor.position.set(0, 1.24, 0.32);
  displayModule.add(frontDoor);

  const oledTex = createOledScreenTexture(
    `₹${point.pricePerKwh.toFixed(2)}`,
    `${maxKw} kW ${primaryConn}`,
    isAvailable ? '#10b981' : '#f59e0b'
  );
  const oledFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.42),
    new THREE.MeshStandardMaterial({
      map: oledTex,
      color: 0xffffff,
      roughness: 0.15,
      emissive: 0x0f172a,
      emissiveIntensity: 0.3,
    })
  );
  oledFace.position.set(0, 1.62, 0.355);
  displayModule.add(oledFace);

  // 7. Parked Aerodynamic EV Quarter-Section & Charge Port (at X = +1.05, Z = +0.55)
  const evBay = new THREE.Group();
  evBay.position.set(1.05, 0.08, 0.55);
  root.add(evBay);

  const evHullShape = new THREE.Shape();
  evHullShape.moveTo(-1.45, 0.16);
  evHullShape.lineTo(1.45, 0.16);
  evHullShape.lineTo(1.38, 0.56);
  evHullShape.lineTo(0.82, 0.72);
  evHullShape.lineTo(-1.12, 0.72);
  evHullShape.lineTo(-1.42, 0.44);
  evHullShape.closePath();

  const evHullGeo = new THREE.ExtrudeGeometry(evHullShape, {
    depth: 1.88,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  evHullGeo.translate(0, 0, -0.94);
  evHullGeo.rotateY(Math.PI / 2);

  const evBodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.22,
    metalness: 0.58,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
  });
  const evHull = new THREE.Mesh(evHullGeo, evBodyMat);
  evHull.position.y = 0.06;
  evHull.castShadow = true;
  evHull.receiveShadow = true;
  evBay.add(evHull);

  const evCabinShape = new THREE.Shape();
  evCabinShape.moveTo(-0.82, 0.7);
  evCabinShape.lineTo(0.84, 0.7);
  evCabinShape.lineTo(0.42, 1.16);
  evCabinShape.lineTo(-0.46, 1.16);
  evCabinShape.closePath();

  const evCabinGeo = new THREE.ExtrudeGeometry(evCabinShape, {
    depth: 1.48,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  evCabinGeo.translate(0, 0, -0.74);
  evCabinGeo.rotateY(Math.PI / 2);

  const evCabin = new THREE.Mesh(
    evCabinGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.12,
      metalness: 0.12,
      transparent: true,
      opacity: isSoftwareGl ? 0.52 : 0.78,
      clearcoat: 1.0,
    })
  );
  evCabin.position.y = 0.06;
  evBay.add(evCabin);

  // Front LED light signature bar
  const evHeadlight = new THREE.Mesh(
    new THREE.BoxGeometry(1.62, 0.07, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 1.1,
      roughness: 0.2,
    })
  );
  evHeadlight.position.set(0, 0.54, -1.42);
  evBay.add(evHeadlight);

  // Wheels with matte rubber tires + brushed alloy hubs
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 18).rotateZ(
    Math.PI / 2
  );
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.26, 14).rotateZ(
    Math.PI / 2
  );
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.24,
    metalness: 0.85,
  });
  for (const [wx, wz] of [
    [-0.98, -0.84],
    [0.98, -0.84],
    [-0.98, 0.94],
    [0.98, 0.94],
  ]) {
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.position.set(wx, 0.32, wz);
    w.castShadow = true;
    evBay.add(w);

    const r = new THREE.Mesh(rimGeo, rimMat);
    r.position.set(wx, 0.32, wz);
    evBay.add(r);
  }

  // EV Charge Inlet Socket on driver-left front fender
  const chargeInlet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.8,
      roughness: 0.25,
    })
  );
  chargeInlet.position.set(-1.04, 0.68, -0.45);
  evBay.add(chargeInlet);
  registerHitPart(chargeInlet, {
    id: 'inlet',
    label: `${primaryConn} Vehicle Charge Inlet`,
    spec: '400V / 800V handshake & thermal lock verified',
  });

  // 8. Articulated Charging Cable from Charger Side -> EV Charge Port
  const cableAssembly = new THREE.Group();
  root.add(cableAssembly);

  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.88, 1.18, -0.58),
    new THREE.Vector3(-0.55, 0.65, -0.35),
    new THREE.Vector3(-0.3, 0.32, -0.05),
    new THREE.Vector3(-0.08, 0.76, 0.1),
  ]);
  const cableMesh = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 28, 0.052, 10, false),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.68,
      metalness: 0.12,
    })
  );
  cableMesh.castShadow = true;
  cableAssembly.add(cableMesh);
  registerHitPart(cableMesh, {
    id: 'cable',
    label: `${primaryConn} Articulated Charging Cable`,
    spec: `Rated up to ${maxKw} kW · Real-time amp telemetry`,
  });

  // Connector gun plug head at EV inlet
  const gunMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.24, 12).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.55,
    })
  );
  gunMesh.position.set(-0.06, 0.76, 0.1);
  cableAssembly.add(gunMesh);

  // Energy flow pulse sphere along cableCurve
  const pulseMat = new THREE.MeshStandardMaterial({
    color: 0x34d399,
    emissive: 0x10b981,
    emissiveIntensity: 1.8,
    roughness: 0.15,
  });
  const pulseSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 14, 10),
    pulseMat
  );
  pulseSphere.visible = false;
  root.add(pulseSphere);

  return {
    root,
    outerShell,
    displayModule,
    internalCore,
    meterModule,
    cableAssembly,
    pulseSphere,
    pulseMat,
    cableCurve,
    interactables,
    subsystemMap,
    bayLampMat,
    groundMat,
  };
}
