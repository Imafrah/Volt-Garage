import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  Power,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  attachStudioEnvironment,
  createConfiguredRenderer,
  createContactShadowTexture,
  createRenderScheduler,
  detectSoftwareWebGL,
  disposeObjectTree,
} from '../three/webglUtils';

interface SmartMeter3DProps {
  serialNumber?: string;
  activePowerKw?: number;
  totalKwh?: number;
  payoutEur?: number;
  isSessionActive?: boolean;
  heightClassName?: string;
}

export function SmartMeter3D({
  serialNumber = 'DE-MUC-SM-90214',
  activePowerKw = 11.0,
  totalKwh = 1482.6,
  payoutEur = 184.5,
  isSessionActive = true,
  heightClassName = 'h-[360px]',
}: SmartMeter3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [displayMode, setDisplayMode] = useState<'kwh' | 'telemetry' | 'payout' | 'grid'>('kwh');
  const [breakerTripped, setBreakerTripped] = useState(false);
  const [backlightOn, setBacklightOn] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);

  // References to sync into Three.js
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const breakerSwitchPivotRef = useRef<THREE.Group | null>(null);
  const discMeshRef = useRef<THREE.Mesh | null>(null);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const breakerTrippedRef = useRef(breakerTripped);
  breakerTrippedRef.current = breakerTripped;
  const powerKwRef = useRef(activePowerKw);
  powerKwRef.current = activePowerKw;

  const sceneActionsRef = useRef<{
    cycleDisplay: () => void;
    toggleBreaker: (tripped: boolean) => void;
    toggleBacklight: (on: boolean) => void;
    resetCamera: () => void;
  } | null>(null);

  // Function to repaint the OLED texture
  const updateScreenCanvas = (
    mode: 'kwh' | 'telemetry' | 'payout' | 'grid',
    tripped: boolean,
    backlight: boolean
  ) => {
    const canvas = screenCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Dark high-contrast OLED background
    ctx.fillStyle = backlight ? '#022c22' : '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Glowing border frame
    ctx.strokeStyle = tripped ? '#ef4444' : backlight ? '#10b981' : '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Status Header
    ctx.fillStyle = tripped ? '#f87171' : '#34d399';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(tripped ? '⚠️ TRIP ALARM' : '● MID CERTIFIED', 26, 42);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(serialNumber, w - 210, 42);

    // Divider Line
    ctx.strokeStyle = '#065f46';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 54);
    ctx.lineTo(w - 24, 54);
    ctx.stroke();

    if (tripped) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 36px monospace';
      ctx.fillText('BREAKER OPEN', 32, 115);
      ctx.fillStyle = '#fca5a5';
      ctx.font = '18px monospace';
      ctx.fillText('Reset mechanical breaker lever', 32, 155);
      ctx.fillText('Fault code: E-004 Ground Current', 32, 185);
    } else {
      switch (mode) {
        case 'kwh':
          ctx.fillStyle = '#6ee7b7';
          ctx.font = '16px monospace';
          ctx.fillText('ACTIVE IMPORT ENERGY (1.8.0)', 26, 82);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 44px monospace';
          ctx.fillText(`${totalKwh.toFixed(1)} kWh`, 26, 134);
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 18px monospace';
          ctx.fillText(`CURRENT LOAD: ${activePowerKw.toFixed(1)} kW (3-PHASE)`, 26, 178);
          break;
        case 'telemetry':
          ctx.fillStyle = '#6ee7b7';
          ctx.font = '16px monospace';
          ctx.fillText('REAL-TIME PHASE TELEMETRY', 26, 80);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px monospace';
          ctx.fillText('L1: 231.2V  L2: 230.8V  L3: 231.0V', 26, 118);
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 24px monospace';
          ctx.fillText('CURRENT: 16.0 A / Phase · 50.01 Hz', 26, 156);
          ctx.fillStyle = '#a7f3d0';
          ctx.font = '16px monospace';
          ctx.fillText('THD Voltage: < 1.4% · PF: 0.99', 26, 188);
          break;
        case 'payout':
          ctx.fillStyle = '#fcd34d';
          ctx.font = '16px monospace';
          ctx.fillText('ESTIMATED 80% HOST PAYOUT ACCUMULATOR', 26, 80);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 44px monospace';
          ctx.fillText(`€ ${payoutEur.toFixed(2)}`, 26, 134);
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 18px monospace';
          ctx.fillText('STATUS: SETTLED & READY FOR DIRECT PAYOUT', 26, 178);
          break;
        case 'grid':
          ctx.fillStyle = '#38bdf8';
          ctx.font = '16px monospace';
          ctx.fillText('GRID CARBON OFFSET & ECO FLOW', 26, 80);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px monospace';
          ctx.fillText('99.2% CLEAN POWER', 26, 126);
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 18px monospace';
          ctx.fillText('CO2 Avoided: 842 kg · Isar River Hydro', 26, 175);
          break;
      }
    }

    // Bottom Bar
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('OCPP 2.0.1 SMART METERING PROTOCOL · EN 50470-3 CLASS B', 26, 222);

    if (screenTextureRef.current) {
      screenTextureRef.current.needsUpdate = true;
    }
  };

  useEffect(() => {
    updateScreenCanvas(displayMode, breakerTripped, backlightOn);
  }, [displayMode, breakerTripped, backlightOn, activePowerKw, totalKwh, payoutEur]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createConfiguredRenderer(
        container.clientWidth || 600,
        container.clientHeight || 360,
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
      (container.clientWidth || 600) / (container.clientHeight || 360),
      0.1,
      80
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.55;
    controls.minPolarAngle = 0.2;
    controls.minDistance = 1.8;
    controls.maxDistance = 8.5;

    const resetCameraPose = () => {
      camera.position.set(-2.4, 1.8, 3.4);
      controls.target.set(0, 0.2, 0);
      controls.update();
    };
    resetCameraPose();

    const envTex = attachStudioEnvironment(renderer, scene);

    // Studio Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = !isSoftwareGl;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x059669, 1.0);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    // Wall Mount Backing Plate
    const wallGeo = new THREE.BoxGeometry(4.8, 4.2, 0.1);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.85,
      metalness: 0.1,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 0.2, -0.65);
    wall.receiveShadow = true;
    scene.add(wall);

    // DIN Rail
    const railGeo = new THREE.BoxGeometry(3.6, 0.14, 0.08);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.25,
      metalness: 0.85,
    });
    const dinRail = new THREE.Mesh(railGeo, railMat);
    dinRail.position.set(0, 0.2, -0.52);
    scene.add(dinRail);

    // Smart Meter Enclosure Main Group
    const meterGroup = new THREE.Group();
    scene.add(meterGroup);

    // Main Industrial Casing (Flame-retardant Polycarbonate)
    const caseGeo = new THREE.BoxGeometry(2.4, 2.8, 0.85);
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.4,
    });
    const caseMesh = new THREE.Mesh(caseGeo, caseMat);
    caseMesh.castShadow = true;
    caseMesh.receiveShadow = true;
    meterGroup.add(caseMesh);

    // Front Beveled Faceplate
    const faceplateGeo = new THREE.BoxGeometry(2.2, 2.6, 0.12);
    const faceplateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.6,
    });
    const faceplate = new THREE.Mesh(faceplateGeo, faceplateMat);
    faceplate.position.set(0, 0, 0.45);
    meterGroup.add(faceplate);

    // Dynamic 2D Canvas OLED Screen Texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    screenCanvasRef.current = canvas;
    const screenTex = new THREE.CanvasTexture(canvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTextureRef.current = screenTex;

    // Paint initial canvas frame
    updateScreenCanvas(displayMode, breakerTripped, backlightOn);

    // LCD Screen Plane
    const screenGeo = new THREE.PlaneGeometry(1.85, 0.95);
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTex,
      emissiveMap: screenTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.75,
      roughness: 0.1,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.55, 0.52);
    meterGroup.add(screenMesh);

    // Transparent Glass Screen Cover
    const glassCover = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 1.05, 0.04),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.35,
        clearcoat: 1.0,
      })
    );
    glassCover.position.set(0, 0.55, 0.545);
    meterGroup.add(glassCover);

    // Spinning Digital Watt-Hour Disc Simulation
    const discGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.02, 32);
    discGeo.rotateX(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.2,
      metalness: 0.85,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(0, -0.22, 0.518);
    meterGroup.add(disc);
    discMeshRef.current = disc;

    // Red mark on disc for rotational tracking
    const markGeo = new THREE.BoxGeometry(0.04, 0.38, 0.03);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const mark = new THREE.Mesh(markGeo, markMat);
    disc.add(mark);

    // Interactive Mechanical Circuit Breaker Lever
    const breakerBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
    );
    breakerBox.position.set(-0.65, -0.75, 0.52);
    meterGroup.add(breakerBox);

    const breakerPivot = new THREE.Group();
    breakerPivot.position.set(-0.65, -0.65, 0.6);
    const breakerLever = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.32, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.5 })
    );
    breakerLever.position.set(0, -0.15, 0);
    breakerPivot.add(breakerLever);
    meterGroup.add(breakerPivot);
    breakerSwitchPivotRef.current = breakerPivot;

    // Interactive Button on 3D Meter Face (Display Mode Selector)
    const btnGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16).rotateX(Math.PI / 2);
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
      roughness: 0.4,
    });
    const btnMesh = new THREE.Mesh(btnGeo, btnMat);
    btnMesh.position.set(0.65, -0.75, 0.53);
    meterGroup.add(btnMesh);

    // Active Status LED indicator (Green = normal, Amber = warning/trip)
    const ledGeo = new THREE.SphereGeometry(0.05, 12, 12);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 2.5,
    });
    const statusLed = new THREE.Mesh(ledGeo, ledMat);
    statusLed.position.set(0.65, -0.5, 0.53);
    meterGroup.add(statusLed);

    // Infeed & Outfeed Copper Cable Bundles
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
    const cableTop1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12), cableMat);
    cableTop1.position.set(-0.4, 1.7, 0.2);
    meterGroup.add(cableTop1);
    const cableTop2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12), cableMat);
    cableTop2.position.set(0.4, 1.7, 0.2);
    meterGroup.add(cableTop2);

    const cableBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), cableMat);
    cableBottom.position.set(0, -1.8, 0.2);
    meterGroup.add(cableBottom);

    // Glowing Power Current Particles
    const particleCount = 14;
    const particleGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const particles: THREE.Mesh[] = [];
    for (let i = 0; i < particleCount; i++) {
      const p = new THREE.Mesh(particleGeo, particleMat);
      meterGroup.add(p);
      particles.push(p);
    }

    // Animation & Render Scheduler
    let particlePhase = 0;
    const scheduler = createRenderScheduler(
      renderer,
      scene,
      camera,
      isSoftwareGl,
      (dt) => {
        let dirty = false;

        if (autoRotateRef.current) {
          meterGroup.rotation.y += dt * 0.45;
          dirty = true;
        }

        // Disc rotation speed proportional to active kW
        if (!breakerTrippedRef.current && discMeshRef.current) {
          const speed = (powerKwRef.current / 11) * 3.5;
          discMeshRef.current.rotation.z += dt * speed;
          dirty = true;
        }

        // Current particle flow animation from top to bottom
        if (!breakerTrippedRef.current) {
          particlePhase = (particlePhase + dt * 1.5) % 1;
          for (let i = 0; i < particles.length; i++) {
            const t = (particlePhase + i / particles.length) % 1;
            // Linear traversal from Y = 1.4 down to Y = -1.4
            particles[i].position.set(
              (i % 2 === 0 ? -0.4 : 0.4) * (1 - t) + (0) * t,
              1.4 - t * 2.8,
              0.25
            );
          }
          dirty = true;
        }

        return dirty;
      }
    );

    sceneActionsRef.current = {
      cycleDisplay: () => {
        setDisplayMode((prev) => {
          const next =
            prev === 'kwh' ? 'telemetry' : prev === 'telemetry' ? 'payout' : prev === 'payout' ? 'grid' : 'kwh';
          updateScreenCanvas(next, breakerTrippedRef.current, backlightOn);
          scheduler.requestRender();
          return next;
        });
      },
      toggleBreaker: (tripped: boolean) => {
        if (breakerPivot) {
          breakerPivot.rotation.x = tripped ? -0.7 : 0;
        }
        ledMat.color.setHex(tripped ? 0xef4444 : 0x10b981);
        ledMat.emissive.setHex(tripped ? 0xef4444 : 0x10b981);
        updateScreenCanvas(displayMode, tripped, backlightOn);
        scheduler.requestRender();
      },
      toggleBacklight: (on: boolean) => {
        updateScreenCanvas(displayMode, breakerTrippedRef.current, on);
        scheduler.requestRender();
      },
      resetCamera: () => {
        resetCameraPose();
        scheduler.requestRender();
      },
    };

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
      screenTex.dispose();
      renderer.dispose();
    };
  }, []);

  const handleCycleMode = () => {
    sceneActionsRef.current?.cycleDisplay();
  };

  const handleToggleBreaker = () => {
    const next = !breakerTripped;
    setBreakerTripped(next);
    sceneActionsRef.current?.toggleBreaker(next);
  };

  const handleToggleBacklight = () => {
    const next = !backlightOn;
    setBacklightOn(next);
    sceneActionsRef.current?.toggleBacklight(next);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-sm">
      {/* Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold tracking-tight text-zinc-900">
                DIN-Rail Smart Meter Digital Twin
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                OCPP 2.0.1
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              High-precision 3-phase revenue meter with metered payout validation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCycleMode}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 shadow-xs"
          >
            <Gauge className="h-3.5 w-3.5" />
            <span>Cycle LCD Screen</span>
          </button>
        </div>
      </div>

      {/* Main 3D Canvas */}
      <div className="relative">
        <div
          ref={mountRef}
          className={`${heightClassName} w-full select-none cursor-grab active:cursor-grabbing`}
          aria-label="Interactive 3D DIN-Rail Smart Meter. Drag to orbit, click controls below to test circuit breaker, toggle OLED backlight, or cycle LCD modes."
        />

        {/* Top-Right Reset & Auto-spin */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => sceneActionsRef.current?.resetCamera()}
            title="Reset 3D Camera"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white/95 text-zinc-700 shadow-sm backdrop-blur-xs hover:bg-zinc-50 hover:text-zinc-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            className={`flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium shadow-sm backdrop-blur-xs transition-colors ${
              autoRotate
                ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800'
                : 'border-zinc-200 bg-white/95 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <Activity className={`h-3 w-3 ${autoRotate ? 'text-emerald-600 animate-pulse' : ''}`} />
            <span>{autoRotate ? 'Rotating' : 'Auto-Spin'}</span>
          </button>
        </div>

        {/* Bottom Interactive Controls */}
        <div className="relative z-10 border-t border-zinc-100 bg-zinc-50/90 px-4 py-3 backdrop-blur-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Display Mode Indicator */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 font-medium">Active Mode:</span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'kwh', label: 'Import kWh' },
                    { id: 'telemetry', label: '3-Phase V/A' },
                    { id: 'payout', label: '80% Payout' },
                    { id: 'grid', label: 'Eco Mix' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setDisplayMode(m.id);
                      updateScreenCanvas(m.id, breakerTripped, backlightOn);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      displayMode === m.id
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Breaker & Backlight Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleBreaker}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  breakerTripped
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                <span>{breakerTripped ? 'Reset Breaker Lever' : 'Test Breaker Trip'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleBacklight}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  backlightOn
                    ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>OLED Glow</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
