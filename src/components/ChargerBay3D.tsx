import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  RotateCcw,
  Sun,
  Zap,
} from 'lucide-react';
import type { ChargingPoint } from '../domain/types';
import {
  type BaySubsystemInfo,
  type ChargerBayTwinRefs,
  buildChargerBayTwin,
} from '../three/bayModel';
import {
  attachStudioEnvironment,
  createConfiguredRenderer,
  createContactShadowTexture,
  createRenderScheduler,
  detectSoftwareWebGL,
  disposeObjectTree,
} from '../three/webglUtils';

interface ChargerBay3DProps {
  point: ChargingPoint;
  initialPowerFlow?: boolean;
  heightClassName?: string;
}

const _rayPointer = new THREE.Vector2();
const _cableSampleVec = new THREE.Vector3();

export function ChargerBay3D({
  point,
  initialPowerFlow = false,
  heightClassName = 'h-72',
}: ChargerBay3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [explodePct, setExplodePct] = useState(0);
  const [powerFlowActive, setPowerFlowActive] = useState(initialPowerFlow);
  const [eveningMode, setEveningMode] = useState(false);
  const [selectedPart, setSelectedPart] = useState<BaySubsystemInfo | null>(
    null
  );
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);

  const explodeRef = useRef(0);
  explodeRef.current = explodePct / 100;
  const powerFlowRef = useRef(initialPowerFlow);
  powerFlowRef.current = powerFlowActive;
  const eveningRef = useRef(false);
  eveningRef.current = eveningMode;

  const controllerRef = useRef<{
    triggerRender: () => void;
    resetView: () => void;
    setCameraPreset: (preset: 'iso' | 'front' | 'connector' | 'top') => void;
    rebuildPoint: (nextPoint: ChargingPoint) => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createConfiguredRenderer(
        container.clientWidth || 520,
        container.clientHeight || 288,
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
    const dayBg = new THREE.Color(0xeef2f6);
    const nightBg = new THREE.Color(0x0f172a);
    scene.background = dayBg.clone();
    scene.fog = new THREE.FogExp2(0xeef2f6, 0.025);

    const camera = new THREE.PerspectiveCamera(
      40,
      (container.clientWidth || 520) / (container.clientHeight || 288),
      0.2,
      100
    );
    const resetCameraPose = () => {
      camera.position.set(-4.2, 3.05, 5.5);
      controls.target.set(0.05, 1.15, 0.0);
      controls.update();
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = 0.15;
    controls.minDistance = 2.6;
    controls.maxDistance = 12;
    resetCameraPose();

    const envTex = attachStudioEnvironment(renderer, scene);
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x94a3b8, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.65);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.65);
    rimLight.position.set(-5, 4, -5);
    scene.add(rimLight);

    const shadowTexture = createContactShadowTexture();
    const twinHolder = new THREE.Group();
    scene.add(twinHolder);
    let twin: ChargerBayTwinRefs = buildChargerBayTwin(
      point,
      shadowTexture,
      isSoftwareGl
    );
    twinHolder.add(twin.root);

    let currentExplode = 0;
    let pulseProgress = 0;
    let eveningBlend = 0;

    const scheduler = createRenderScheduler(
      renderer,
      scene,
      camera,
      isSoftwareGl,
      (dt) => {
        let keepRunning = false;

        // Smooth exploded-view layer separation (instant settle on software WebGL)
        const targetExp = explodeRef.current;
        if (isSoftwareGl) {
          currentExplode = targetExp;
        } else if (Math.abs(currentExplode - targetExp) > 0.004) {
          currentExplode = THREE.MathUtils.damp(currentExplode, targetExp, 9, dt);
          keepRunning = true;
        } else {
          currentExplode = targetExp;
        }

        twin.outerShell.position.y = currentExplode * 0.72;
        twin.displayModule.position.z = currentExplode * 0.78;
        twin.meterModule.position.x = -currentExplode * 0.62;
        twin.internalCore.position.z = currentExplode * 0.2;

        // Smooth evening/daylight transition (instant settle on software WebGL)
        const targetNight = eveningRef.current ? 1 : 0;
        if (isSoftwareGl) {
          eveningBlend = targetNight;
        } else if (Math.abs(eveningBlend - targetNight) > 0.005) {
          eveningBlend = THREE.MathUtils.damp(eveningBlend, targetNight, 10, dt);
          keepRunning = true;
        } else {
          eveningBlend = targetNight;
        }

        const bgCol = scene.background as THREE.Color;
        bgCol.copy(dayBg).lerp(nightBg, eveningBlend);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.copy(bgCol);
        }
        keyLight.intensity = THREE.MathUtils.lerp(1.65, 0.45, eveningBlend);
        hemiLight.intensity = THREE.MathUtils.lerp(0.78, 0.34, eveningBlend);
        twin.bayLampMat.emissiveIntensity = THREE.MathUtils.lerp(
          1.2,
          2.6,
          eveningBlend
        );
        twin.groundMat.color.setHex(eveningBlend > 0.5 ? 0x1e293b : 0xdbe3ed);

        // Energy flow pulse along articulated charging cable
        if (powerFlowRef.current) {
          twin.pulseSphere.visible = true;
          pulseProgress = (pulseProgress + dt * 0.65) % 1;
          twin.cableCurve.getPointAt(pulseProgress, _cableSampleVec);
          twin.pulseSphere.position.copy(_cableSampleVec);
          keepRunning = true;
        } else {
          twin.pulseSphere.visible = false;
        }

        controls.update();
        return keepRunning;
      }
    );

    const rebuildPoint = (nextPoint: ChargingPoint) => {
      twinHolder.remove(twin.root);
      disposeObjectTree(twin.root);
      twin = buildChargerBayTwin(nextPoint, shadowTexture, isSoftwareGl);
      twinHolder.add(twin.root);
      setSelectedPart(null);
      scheduler.requestRender();
    };

    const setCameraPreset = (preset: 'iso' | 'front' | 'connector' | 'top') => {
      switch (preset) {
        case 'iso':
          camera.position.set(-4.2, 3.05, 5.5);
          controls.target.set(0.05, 1.15, 0.0);
          break;
        case 'front':
          camera.position.set(-1.35, 1.8, 3.6);
          controls.target.set(-1.35, 1.2, -0.6);
          break;
        case 'connector':
          camera.position.set(-0.2, 1.3, 0.4);
          controls.target.set(0.85, 0.85, 0.4);
          break;
        case 'top':
          camera.position.set(-0.2, 6.8, 0.1);
          controls.target.set(-0.2, 0.5, 0.0);
          break;
      }
      controls.update();
      scheduler.requestRender();
    };

    controllerRef.current = {
      triggerRender: () => scheduler.requestRender(),
      resetView: () => {
        resetCameraPose();
        scheduler.requestRender();
      },
      setCameraPreset,
      rebuildPoint,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    scheduler.requestRender();

    const onControlChange = () => scheduler.requestRender();
    controls.addEventListener('change', onControlChange);

    // Raycast hardware inspection on click
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    let pointerDown: { x: number; y: number } | null = null;

    const pickSubsystem = (
      clientX: number,
      clientY: number
    ): BaySubsystemInfo | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      _rayPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _rayPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_rayPointer, camera);
      const hits = raycaster.intersectObjects(twin.interactables, false);
      if (hits.length > 0) {
        return twin.subsystemMap.get(hits[0].object as THREE.Mesh) ?? null;
      }
      return null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      const dist = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
      pointerDown = null;
      if (dist > 6) return;
      const part = pickSubsystem(e.clientX, e.clientY);
      setSelectedPart(part);
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFallback(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth || 520;
      const h = container.clientHeight || 288;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      scheduler.requestRender();
    });
    resizeObserver.observe(container);

    return () => {
      controllerRef.current = null;
      resizeObserver.disconnect();
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );
      scheduler.dispose();
      disposeObjectTree(scene);
      envTex.dispose();
      shadowTexture.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.rebuildPoint(point);
  }, [point.id]);

  useEffect(() => {
    controllerRef.current?.triggerRender();
  }, [explodePct, powerFlowActive, eveningMode]);

  if (webglFallback) {
    return (
      <div
        className={`flex ${heightClassName} flex-col items-center justify-center bg-slate-100 p-6 text-center`}
      >
        <Zap className="h-7 w-7 text-emerald-600" />
        <p className="mt-2 text-xs font-semibold text-slate-900">
          {point.name} · 3D Twin Unavailable
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative ${heightClassName} w-full overflow-hidden bg-slate-100 select-none`}
    >
      <div
        ref={mountRef}
        data-testid="charger-bay-3d-canvas"
        data-exploded-pct={explodePct}
        data-power-flow={powerFlowActive ? 'active' : 'paused'}
        data-lighting={eveningMode ? 'evening' : 'daylight'}
        className="h-full w-full"
        aria-label={`Interactive 3D charger hardware twin for ${point.name}. Drag to orbit, use exploded housing slider, or click parts to inspect.`}
      />

      {/* Top-left clicked subsystem hardware spec readout */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 max-w-[260px] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-xs">
        <div className="font-semibold text-slate-900">
          {selectedPart ? selectedPart.label : `${point.name} · 3D Twin`}
        </div>
        <div className="mt-0.5 text-slate-600">
          {selectedPart
            ? selectedPart.spec
            : 'Click hardware parts or slide Exploded Housing to inspect OCPP meter'}
        </div>
      </div>

      {/* Top-right camera presets & reset */}
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
        <div
          role="group"
          aria-label="3D camera perspective"
          className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white/95 p-0.5 shadow-xs"
        >
          <button
            type="button"
            onClick={() => controllerRef.current?.setCameraPreset('iso')}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Iso
          </button>
          <button
            type="button"
            onClick={() => controllerRef.current?.setCameraPreset('front')}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => controllerRef.current?.setCameraPreset('connector')}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Plug
          </button>
        </div>
        <button
          type="button"
          onClick={() => controllerRef.current?.resetView()}
          aria-label="Reset 3D bay camera"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-700 shadow-xs hover:bg-slate-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom collapsible 3D hardware dock */}
      <div className="pointer-events-none absolute right-2.5 bottom-2.5 left-2.5 z-10 flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          aria-expanded={!dockCollapsed}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-xs hover:bg-slate-50"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show Bay Controls
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Hide Bay Controls
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs shadow-sm">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
              <span className="whitespace-nowrap">Exploded</span>
              <input
                type="range"
                aria-label="Exploded housing slider"
                min={0}
                max={100}
                value={explodePct}
                onChange={(e) => setExplodePct(Number(e.target.value))}
                className="w-20 accent-emerald-600"
              />
              <span className="w-8 font-mono text-[11px] tabular-nums text-slate-900">
                {explodePct}%
              </span>
            </label>

            <button
              type="button"
              onClick={() => setPowerFlowActive((p) => !p)}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                powerFlowActive
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Zap className="h-3 w-3" />
              {powerFlowActive ? 'Power Flowing' : 'Power Flow'}
            </button>

            <button
              type="button"
              onClick={() => setEveningMode((m) => !m)}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                eveningMode
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Sun className="h-3 w-3" />
              {eveningMode ? 'Evening Bay' : 'Daylight'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
