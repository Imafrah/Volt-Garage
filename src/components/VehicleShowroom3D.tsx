import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  BatteryCharging,
  Camera,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  Lightbulb,
  Maximize2,
  Palette,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { Vehicle } from '../domain/types';
import {
  attachStudioEnvironment,
  createConfiguredRenderer,
  createContactShadowTexture,
  createRenderScheduler,
  detectSoftwareWebGL,
  disposeObjectTree,
} from '../three/webglUtils';

interface VehicleShowroom3DProps {
  vehicles: Vehicle[];
  selectedVehicleId?: string;
  onSelectVehicle?: (id: string) => void;
  heightClassName?: string;
}

const SHOWROOM_PAINTS = [
  { id: 'sapphire', label: 'Sapphire Metallic', hex: 0x1d4ed8, bgClass: 'bg-blue-700' },
  { id: 'emerald', label: 'Emerald Racing Green', hex: 0x047857, bgClass: 'bg-emerald-700' },
  { id: 'obsidian', label: 'Obsidian Black', hex: 0x111827, bgClass: 'bg-slate-900' },
  { id: 'frozen', label: 'Frozen Grey', hex: 0x64748b, bgClass: 'bg-slate-500' },
  { id: 'sunset', label: 'Sunset Crimson', hex: 0xbe123c, bgClass: 'bg-rose-700' },
  { id: 'white', label: 'Alpine Pearl White', hex: 0xf8fafc, bgClass: 'bg-white' },
];

export function VehicleShowroom3D({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  heightClassName = 'h-[420px]',
}: VehicleShowroom3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const activeVehicle =
    vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0] ?? null;

  const [paintColor, setPaintColor] = useState(SHOWROOM_PAINTS[0]);
  const [lightsOn, setLightsOn] = useState(true);
  const [portOpen, setPortOpen] = useState(true);
  const [cableConnected, setCableConnected] = useState(true);
  const [xrayBattery, setXrayBattery] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);
  const [selectedSubsystem, setSelectedSubsystem] = useState<string | null>(null);

  // Live refs to sync into animation/render loop
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const cableConnectedRef = useRef(cableConnected);
  cableConnectedRef.current = cableConnected;

  const sceneActionsRef = useRef<{
    setPaintColor: (colorHex: number) => void;
    toggleLights: (on: boolean) => void;
    togglePort: (open: boolean) => void;
    toggleCable: (connected: boolean) => void;
    toggleXray: (active: boolean) => void;
    setCameraPreset: (preset: 'threeQuarter' | 'side' | 'port' | 'top') => void;
    resetCamera: () => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createConfiguredRenderer(
        container.clientWidth || 720,
        container.clientHeight || 420,
        isSoftwareGl
      );
    } catch {
      setWebglFallback(true);
      return;
    }

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);
    scene.fog = new THREE.FogExp2(0xeef2f6, 0.02);

    const camera = new THREE.PerspectiveCamera(
      36,
      (container.clientWidth || 720) / (container.clientHeight || 420),
      0.2,
      100
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minPolarAngle = 0.12;
    controls.minDistance = 2.4;
    controls.maxDistance = 14;

    const resetCameraPose = () => {
      camera.position.set(-4.5, 2.4, 5.0);
      controls.target.set(0, 0.6, 0);
      controls.update();
    };
    resetCameraPose();

    const envTex = attachStudioEnvironment(renderer, scene);

    // Studio Key, Fill, and Rim Lighting
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x94a3b8, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(5, 7, 5);
    keyLight.castShadow = !isSoftwareGl;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.6);
    rimLight.position.set(-6, 3.5, -4);
    scene.add(rimLight);

    // Dynamic car headlights (actual Three.js spotlights illuminating the floor)
    const leftHeadlight = new THREE.SpotLight(0xe0f2fe, 3.5, 9, Math.PI / 6, 0.4);
    leftHeadlight.position.set(-0.55, 0.6, 1.85);
    leftHeadlight.target.position.set(-0.55, 0.0, 6.0);
    scene.add(leftHeadlight);
    scene.add(leftHeadlight.target);

    const rightHeadlight = new THREE.SpotLight(0xe0f2fe, 3.5, 9, Math.PI / 6, 0.4);
    rightHeadlight.position.set(0.55, 0.6, 1.85);
    rightHeadlight.target.position.set(0.55, 0.0, 6.0);
    scene.add(rightHeadlight);
    scene.add(rightHeadlight.target);

    // Showroom Stage Floor & Turntable
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    // Large Matte Circular Stage Floor
    const floorGeo = new THREE.CircleGeometry(7.5, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xdbe3ed,
      roughness: 0.8,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    floor.position.y = 0;
    stageGroup.add(floor);

    // Subtle perimeter guide ring
    const perimeterRingGeo = new THREE.RingGeometry(3.58, 3.62, 64);
    perimeterRingGeo.rotateX(-Math.PI / 2);
    const perimeterRingMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const perimeterRing = new THREE.Mesh(perimeterRingGeo, perimeterRingMat);
    perimeterRing.position.y = 0.012;
    stageGroup.add(perimeterRing);

    // Inner Energy Grid Lines
    const gridCircleGeo = new THREE.RingGeometry(2.4, 2.43, 64);
    gridCircleGeo.rotateX(-Math.PI / 2);
    const gridCircleMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const gridCircle = new THREE.Mesh(gridCircleGeo, gridCircleMat);
    gridCircle.position.y = 0.014;
    stageGroup.add(gridCircle);

    // Contact Shadow
    const shadowTexture = createContactShadowTexture();
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 3.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
    );
    shadowMesh.position.y = 0.02;
    stageGroup.add(shadowMesh);

    // Vehicle Digital Twin Composite Group
    const carGroup = new THREE.Group();
    carGroup.name = 'ShowroomVehicle';
    stageGroup.add(carGroup);

    // Lower Chassis Floor
    const skirtGeo = new THREE.BoxGeometry(1.58, 0.22, 3.7);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.85,
      metalness: 0.25,
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.position.y = 0.32;
    skirtMesh.castShadow = true;
    carGroup.add(skirtMesh);

    // Body Hull (High-detail Extrusion)
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-1.86, 0.26);
    hullShape.lineTo(1.86, 0.26);
    hullShape.lineTo(1.78, 0.58);
    hullShape.lineTo(1.02, 0.76);
    hullShape.lineTo(-1.58, 0.76);
    hullShape.lineTo(-1.84, 0.52);
    hullShape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.5,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.09,
      bevelSegments: 3,
    });
    hullGeo.translate(0, 0, -0.75);
    hullGeo.rotateY(Math.PI / 2);

    const paintMat = new THREE.MeshPhysicalMaterial({
      color: paintColor.hex,
      roughness: 0.16,
      metalness: 0.7,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    const hullMesh = new THREE.Mesh(hullGeo, paintMat);
    hullMesh.position.y = 0.18;
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    carGroup.add(hullMesh);

    // Glass Canopy (Tinted Polycarbonate / Glass Roof)
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-1.12, 0.74);
    cabinShape.lineTo(0.96, 0.74);
    cabinShape.lineTo(0.44, 1.24);
    cabinShape.lineTo(-0.72, 1.24);
    cabinShape.closePath();

    const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.24,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.07,
      bevelSegments: 3,
    });
    cabinGeo.translate(0, 0, -0.62);
    cabinGeo.rotateY(Math.PI / 2);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
      clearcoat: 1.0,
    });
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
    cabinMesh.position.y = 0.18;
    cabinMesh.castShadow = true;
    carGroup.add(cabinMesh);

    // LED Headlamps Matrix
    const headlampGeo = new THREE.BoxGeometry(1.4, 0.06, 0.08);
    const headlampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.8,
      roughness: 0.1,
    });
    const headlamp = new THREE.Mesh(headlampGeo, headlampMat);
    headlamp.position.set(0, 0.58, 1.88);
    carGroup.add(headlamp);

    // Tail Lamp Bar
    const tailGeo = new THREE.BoxGeometry(1.42, 0.06, 0.08);
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff0033,
      emissive: 0xff0044,
      emissiveIntensity: 2.5,
      roughness: 0.1,
    });
    const taillamp = new THREE.Mesh(tailGeo, tailMat);
    taillamp.position.set(0, 0.64, -1.88);
    carGroup.add(taillamp);

    // Alloy Wheels with Dual-tone Finish
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.88,
      metalness: 0.1,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.18,
      metalness: 0.9,
    });
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
    });

    const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 24).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.29, 18).rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.31, 12).rotateZ(Math.PI / 2);

    const wheelPositions: [number, number][] = [
      [-0.84, 1.18],
      [0.84, 1.18],
      [-0.84, -1.18],
      [0.84, -1.18],
    ];
    for (const [wx, wz] of wheelPositions) {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.35, wz);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      wGroup.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wGroup.add(rim);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      wGroup.add(hub);
      carGroup.add(wGroup);
    }

    // Charge Port Flap & Illuminated Socket (Left Rear Fender: -0.84, 0.66, -1.1)
    const portGroup = new THREE.Group();
    portGroup.position.set(-0.84, 0.66, -1.1);
    carGroup.add(portGroup);

    // Socket Enclosure
    const socketHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    portGroup.add(socketHousing);

    // Glowing CCS Pin Ring
    const socketRing = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.09, 16).rotateY(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
    );
    socketRing.position.set(-0.045, 0, 0);
    portGroup.add(socketRing);

    // Port Door Flap (Swings open 75 degrees)
    const flapPivot = new THREE.Group();
    flapPivot.position.set(-0.045, 0, 0.1);
    const flapDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.22, 0.22),
      paintMat
    );
    flapDoor.position.set(0, 0, -0.1);
    flapPivot.add(flapDoor);
    portGroup.add(flapPivot);
    flapPivot.rotation.y = portOpen ? -1.3 : 0;

    // Coiled 3D Charging Cable & Connector Gun
    const cableGroup = new THREE.Group();
    cableGroup.visible = cableConnected;
    stageGroup.add(cableGroup);

    // Wallbox / Charger Stand on Showroom Floor
    const standOrigin = new THREE.Vector3(-2.2, 0, -1.4);
    const standPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 1.45, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })
    );
    standPillar.position.set(standOrigin.x, 0.725, standOrigin.z);
    standPillar.castShadow = true;
    cableGroup.add(standPillar);

    const standLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.9, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    standLed.position.set(standOrigin.x + 0.12, 0.8, standOrigin.z);
    cableGroup.add(standLed);

    // Dynamic Cable Curve from Wallbox to Vehicle Port
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(standOrigin.x + 0.12, 0.9, standOrigin.z),
      new THREE.Vector3(-1.8, 0.3, -1.3),
      new THREE.Vector3(-1.3, 0.2, -1.15),
      new THREE.Vector3(-0.95, 0.66, -1.1),
      new THREE.Vector3(-0.85, 0.66, -1.1),
    ]);
    const cableTube = new THREE.Mesh(
      new THREE.TubeGeometry(cableCurve, 32, 0.025, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.7 })
    );
    cableTube.castShadow = true;
    cableGroup.add(cableTube);

    // Connector Handle plugged into port
    const gunHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, 0.18, 12).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 })
    );
    gunHandle.position.set(-0.92, 0.66, -1.1);
    cableGroup.add(gunHandle);

    // Animated Energy Pulse along cable
    const pulseSpheres: THREE.Mesh[] = [];
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    for (let i = 0; i < 12; i++) {
      const ps = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), pulseMat);
      cableGroup.add(ps);
      pulseSpheres.push(ps);
    }

    // X-Ray Battery Pack Group
    const batteryGroup = new THREE.Group();
    batteryGroup.name = 'ShowroomBattery';
    batteryGroup.visible = xrayBattery;
    carGroup.add(batteryGroup);

    // Battery pack housing
    const batPack = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.15, 2.3),
      new THREE.MeshStandardMaterial({
        color: 0x064e3b,
        emissive: 0x059669,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.85,
      })
    );
    batPack.position.set(0, 0.3, 0);
    batteryGroup.add(batPack);

    // Dual Drive Motors (Front and Rear)
    const frontMotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.65, 16).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0xb45309, emissiveIntensity: 0.7 })
    );
    frontMotor.position.set(0, 0.38, 1.18);
    batteryGroup.add(frontMotor);

    const rearMotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.7, 16).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0xb45309, emissiveIntensity: 0.7 })
    );
    rearMotor.position.set(0, 0.38, -1.18);
    batteryGroup.add(rearMotor);

    // Animation & Render Scheduler
    let cablePhase = 0;
    const scheduler = createRenderScheduler(
      renderer,
      scene,
      camera,
      isSoftwareGl,
      (dt) => {
        let dirty = false;

        // Auto Turntable Rotation
        if (autoRotateRef.current) {
          stageGroup.rotation.y += dt * 0.4;
          dirty = true;
        }

        // Cable Energy Pulse Animation
        if (cableConnectedRef.current) {
          cablePhase = (cablePhase + dt * 1.2) % 1;
          for (let i = 0; i < pulseSpheres.length; i++) {
            const t = (cablePhase + i / pulseSpheres.length) % 1;
            const pt = cableCurve.getPoint(t);
            pulseSpheres[i].position.copy(pt);
          }
          dirty = true;
        }

        return dirty;
      }
    );

    // Scene Actions Binding
    sceneActionsRef.current = {
      setPaintColor: (hex: number) => {
        paintMat.color.setHex(hex);
        scheduler.requestRender();
      },
      toggleLights: (on: boolean) => {
        leftHeadlight.intensity = on ? 3.5 : 0;
        rightHeadlight.intensity = on ? 3.5 : 0;
        headlampMat.emissiveIntensity = on ? 2.8 : 0.2;
        taillamp.visible = on;
        scheduler.requestRender();
      },
      togglePort: (open: boolean) => {
        flapPivot.rotation.y = open ? -1.3 : 0;
        scheduler.requestRender();
      },
      toggleCable: (connected: boolean) => {
        cableGroup.visible = connected;
        scheduler.requestRender();
      },
      toggleXray: (active: boolean) => {
        batteryGroup.visible = active;
        paintMat.transparent = active;
        paintMat.opacity = active ? 0.35 : 1.0;
        paintMat.wireframe = active;
        scheduler.requestRender();
      },
      setCameraPreset: (preset) => {
        switch (preset) {
          case 'threeQuarter':
            camera.position.set(-4.5, 2.4, 5.0);
            controls.target.set(0, 0.6, 0);
            break;
          case 'side':
            camera.position.set(-5.6, 1.2, 0);
            controls.target.set(0, 0.6, 0);
            break;
          case 'port':
            camera.position.set(-2.0, 1.1, -1.8);
            controls.target.set(-0.84, 0.66, -1.1);
            break;
          case 'top':
            camera.position.set(0, 7.5, 0.1);
            controls.target.set(0, 0.4, 0);
            break;
        }
        controls.update();
        scheduler.requestRender();
      },
      resetCamera: () => {
        resetCameraPose();
        scheduler.requestRender();
      },
    };

    // Resize Observer
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const w = e.contentRect.width;
      const h = e.contentRect.height;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        scheduler.requestRender();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      scheduler.dispose();
      disposeObjectTree(scene);
      envTex.dispose();
      shadowTexture.dispose();
      renderer.dispose();
    };
  }, []);

  const handleSelectColor = (paint: typeof SHOWROOM_PAINTS[0]) => {
    setPaintColor(paint);
    sceneActionsRef.current?.setPaintColor(paint.hex);
  };

  const handleToggleLights = () => {
    const next = !lightsOn;
    setLightsOn(next);
    sceneActionsRef.current?.toggleLights(next);
  };

  const handleTogglePort = () => {
    const next = !portOpen;
    setPortOpen(next);
    sceneActionsRef.current?.togglePort(next);
    if (!next && cableConnected) {
      setCableConnected(false);
      sceneActionsRef.current?.toggleCable(false);
    }
  };

  const handleToggleCable = () => {
    const next = !cableConnected;
    setCableConnected(next);
    sceneActionsRef.current?.toggleCable(next);
    if (next && !portOpen) {
      setPortOpen(true);
      sceneActionsRef.current?.togglePort(true);
    }
  };

  const handleToggleXray = () => {
    const next = !xrayBattery;
    setXrayBattery(next);
    sceneActionsRef.current?.toggleXray(next);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm">
      {/* Top Header & Vehicle Selector */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
            <Car className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold tracking-tight text-slate-900">
                EV Virtual Garage &amp; Inspection
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                3D TWIN
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Interactive 360° vehicle inspection, paint customizer &amp; charging port simulation
            </p>
          </div>
        </div>

        {/* Vehicle Selector Tabs */}
        {vehicles.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1">
            {vehicles.map((v) => {
              const isSelected = (activeVehicle?.id ?? vehicles[0]?.id) === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVehicle?.(v.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {v.make} {v.model}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main 3D Canvas */}
      <div className="relative">
        <div
          ref={mountRef}
          className={`${heightClassName} w-full select-none cursor-grab active:cursor-grabbing`}
          aria-label="3D EV Showroom. Drag to orbit 360 degrees, scroll to zoom, click controls to customize paint and inspect battery."
        />

        {/* Top-Left Vehicle Specs Card Overlay */}
        {activeVehicle && (
          <div className="pointer-events-none absolute top-4 left-4 z-10 hidden flex-col gap-2 sm:flex">
            <div className="rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-md backdrop-blur-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-900">
                  {activeVehicle.make} {activeVehicle.model} ({activeVehicle.year})
                </span>
                <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                  {activeVehicle.connectorType.join(' / ')}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-slate-600">
                <div>
                  <span className="text-slate-400">Plate: </span>
                  <span className="text-slate-800 font-semibold">{activeVehicle.licensePlate}</span>
                </div>
                <div>
                  <span className="text-slate-400">Battery: </span>
                  <span className="text-slate-800 font-semibold">{activeVehicle.batteryCapacity} kWh</span>
                </div>
                <div>
                  <span className="text-slate-400">Year: </span>
                  <span className="text-slate-800 font-semibold">{activeVehicle.year}</span>
                </div>
                <div>
                  <span className="text-slate-400">Est. Range: </span>
                  <span className="text-emerald-700 font-semibold">{Math.round(activeVehicle.batteryCapacity * 5.6)} km</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top-Right Camera Angles & Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur-xs">
            <button
              type="button"
              onClick={() => sceneActionsRef.current?.setCameraPreset('threeQuarter')}
              title="Camera: 3/4 Isometric"
              className="rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              3/4 Iso
            </button>
            <button
              type="button"
              onClick={() => sceneActionsRef.current?.setCameraPreset('side')}
              title="Camera: Side Profile"
              className="rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => sceneActionsRef.current?.setCameraPreset('port')}
              title="Camera: Charge Port Macro"
              className="rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Inlet
            </button>
            <button
              type="button"
              onClick={() => sceneActionsRef.current?.setCameraPreset('top')}
              title="Camera: Aero Top-Down"
              className="rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Top
            </button>
            <button
              type="button"
              onClick={() => sceneActionsRef.current?.resetCamera()}
              title="Reset Camera"
              className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-xs transition-colors ${
              autoRotate
                ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Play className={`h-3 w-3 ${autoRotate ? 'text-emerald-600 animate-pulse' : ''}`} />
            <span>{autoRotate ? 'Turntable Active' : 'Auto-Spin'}</span>
          </button>
        </div>

        {/* Bottom Interactive Customizer Dock */}
        <div className="relative z-10 border-t border-slate-100 bg-slate-50/90 px-4 py-3 backdrop-blur-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Paint Palette Selection */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Palette className="h-3.5 w-3.5 text-slate-400" />
                <span className="hidden sm:inline">Color:</span>
              </div>
              <div className="flex items-center gap-1.5">
                {SHOWROOM_PAINTS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectColor(p)}
                    title={`Paint: ${p.label}`}
                    className={`relative h-6 w-6 rounded-full transition-all ${p.bgClass} ${
                      paintColor.id === p.id
                        ? 'ring-2 ring-emerald-600 ring-offset-2 ring-offset-white scale-110'
                        : 'opacity-75 hover:opacity-100 hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Interactive Vehicle Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleLights}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  lightsOn
                    ? 'border-sky-500 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span>Matrix Lights</span>
              </button>

              <button
                type="button"
                onClick={handleTogglePort}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  portOpen
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Port Flap</span>
              </button>

              <button
                type="button"
                onClick={handleToggleCable}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  cableConnected
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <BatteryCharging className="h-3.5 w-3.5" />
                <span>3D Cable</span>
              </button>

              <button
                type="button"
                onClick={handleToggleXray}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  xrayBattery
                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>X-Ray Chassis</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
