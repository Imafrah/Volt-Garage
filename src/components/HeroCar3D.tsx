import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Play, RotateCcw, Zap } from 'lucide-react';

interface HeroCar3DProps {
  onSessionToggle?: (charging: boolean) => void;
  isCharging?: boolean;
}

const CAR_PAINTS = [
  { id: 'sapphire', label: 'Sapphire', hex: 0x1d4ed8 },
  { id: 'emerald', label: 'Emerald', hex: 0x059669 },
  { id: 'obsidian', label: 'Obsidian', hex: 0x18181b },
  { id: 'pearl', label: 'Pearl White', hex: 0xf8fafc },
];

export function HeroCar3D({ onSessionToggle, isCharging = true }: HeroCar3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [paintColor, setPaintColor] = useState(CAR_PAINTS[0]);
  const [drivingState, setDrivingState] = useState<'driving' | 'parked'>('driving');
  const [batteryPct, setBatteryPct] = useState(68);

  const paintColorRef = useRef(paintColor.hex);
  paintColorRef.current = paintColor.hex;

  const isChargingRef = useRef(isCharging);
  isChargingRef.current = isCharging;

  const replayDriveRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 360;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f5);
    scene.fog = new THREE.FogExp2(0xf4f4f5, 0.04);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(-4.2, 2.2, 4.4);
    camera.lookAt(0, 0.5, 0);

    // 2. High-performance WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 3. Studio Architectural Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.8);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x10b981, 0.6);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);

    // 4. Ground Pad & Pavement with Architectural Markings
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.9,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Charging Bay Pavement Pad
    const bayPadGeo = new THREE.BoxGeometry(3.6, 0.04, 6.2);
    const bayPadMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.82,
      metalness: 0.1,
    });
    const bayPad = new THREE.Mesh(bayPadGeo, bayPadMat);
    bayPad.position.set(0, 0.02, 0);
    bayPad.receiveShadow = true;
    scene.add(bayPad);

    // Bay Perimeter Line Stripes (Emerald Accent)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.5,
    });
    const leftStripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 5.8), stripeMat);
    leftStripe.position.set(-1.65, 0.045, 0);
    scene.add(leftStripe);

    const rightStripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 5.8), stripeMat);
    rightStripe.position.set(1.65, 0.045, 0);
    scene.add(rightStripe);

    // 5. Wallbox Charging Pedestal at Front of Bay
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.set(1.4, 0, 2.4);
    scene.add(pedestalGroup);

    const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.3, 16);
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3, metalness: 0.8 });
    const post = new THREE.Mesh(postGeo, darkMetalMat);
    post.position.y = 0.65;
    post.castShadow = true;
    pedestalGroup.add(post);

    const boxGeo = new THREE.BoxGeometry(0.36, 0.6, 0.22);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2, metalness: 0.7 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 1.25;
    box.castShadow = true;
    pedestalGroup.add(box);

    const ringGeo = new THREE.TorusGeometry(0.1, 0.016, 16, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const haloRing = new THREE.Mesh(ringGeo, ringMat);
    haloRing.position.set(0, 1.35, 0.12);
    pedestalGroup.add(haloRing);

    // 6. Detailed 3D EV Car Model
    const carRoot = new THREE.Group();
    scene.add(carRoot);

    // Contact Shadow below car
    const shadowGeo = new THREE.PlaneGeometry(2.6, 5.0);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.7 });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.046;
    carRoot.add(contactShadow);

    // Car Body Hull
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-1.8, 0.24);
    hullShape.lineTo(1.8, 0.24);
    hullShape.lineTo(1.72, 0.54);
    hullShape.lineTo(0.96, 0.72);
    hullShape.lineTo(-1.54, 0.72);
    hullShape.lineTo(-1.78, 0.48);
    hullShape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.48,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.07,
      bevelSegments: 2,
    });
    hullGeo.translate(0, 0, -0.74);
    hullGeo.rotateY(Math.PI / 2);

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: paintColorRef.current,
      roughness: 0.16,
      metalness: 0.72,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const carHull = new THREE.Mesh(hullGeo, bodyMat);
    carHull.position.y = 0.18;
    carHull.castShadow = true;
    carHull.receiveShadow = true;
    carRoot.add(carHull);

    // Aerodynamic Cabin Glass
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-1.08, 0.7);
    cabinShape.lineTo(0.92, 0.7);
    cabinShape.lineTo(0.42, 1.18);
    cabinShape.lineTo(-0.68, 1.18);
    cabinShape.closePath();

    const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.22,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    });
    cabinGeo.translate(0, 0, -0.61);
    cabinGeo.rotateY(Math.PI / 2);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
      clearcoat: 1.0,
    });
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.y = 0.18;
    cabin.castShadow = true;
    carRoot.add(cabin);

    // Matrix LED Headlamps
    const headlampGeo = new THREE.BoxGeometry(1.36, 0.06, 0.06);
    const headlampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.5,
      roughness: 0.1,
    });
    const headlamp = new THREE.Mesh(headlampGeo, headlampMat);
    headlamp.position.set(0, 0.56, 1.84);
    carRoot.add(headlamp);

    // Headlight Spotlights Illuminating Pavement
    const leftLight = new THREE.SpotLight(0xffffff, 2.5, 8, Math.PI / 7, 0.5);
    leftLight.position.set(-0.5, 0.56, 1.84);
    leftLight.target.position.set(-0.5, 0, 6);
    scene.add(leftLight.target);
    carRoot.add(leftLight);

    const rightLight = new THREE.SpotLight(0xffffff, 2.5, 8, Math.PI / 7, 0.5);
    rightLight.position.set(0.5, 0.56, 1.84);
    rightLight.target.position.set(0.5, 0, 6);
    scene.add(rightLight.target);
    carRoot.add(rightLight);

    // Slim Tail Lamp Light Bar
    const tailGeo = new THREE.BoxGeometry(1.38, 0.05, 0.06);
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff0033,
      emissive: 0xff0044,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });
    const taillamp = new THREE.Mesh(tailGeo, tailMat);
    taillamp.position.set(0, 0.62, -1.84);
    carRoot.add(taillamp);

    // 4 Rotating Alloy Wheels
    const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 24).rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 16).rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.85 });

    const wheels: THREE.Group[] = [];
    const wheelPositions: [number, number][] = [
      [-0.82, 1.15],
      [0.82, 1.15],
      [-0.82, -1.15],
      [0.82, -1.15],
    ];

    for (const [wx, wz] of wheelPositions) {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.34, wz);

      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      wGroup.add(tire);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      wGroup.add(rim);

      carRoot.add(wGroup);
      wheels.push(wGroup);
    }

    // 7. Dynamic Flexible Charging Cable (Pedestal to Car Charge Port)
    const cablePoints = [
      new THREE.Vector3(1.4, 1.15, 2.4),
      new THREE.Vector3(1.3, 0.4, 1.8),
      new THREE.Vector3(1.0, 0.2, 0.8),
      new THREE.Vector3(0.85, 0.58, 0.2), // Car charge port inlet
    ];
    const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
    const cableGeo = new THREE.TubeGeometry(cableCurve, 24, 0.024, 8, false);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.7 });
    const cableMesh = new THREE.Mesh(cableGeo, cableMat);
    scene.add(cableMesh);

    // Energy Pulse Particle traversing the cable
    const pulseGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
    scene.add(pulseMesh);

    // Initial Car Drive-in Coordinates
    let carProgressZ = -6.0; // Starts back outside the bay
    const targetZ = 0.0;
    let isDriving = true;

    replayDriveRef.current = () => {
      carProgressZ = -6.0;
      isDriving = true;
      setDrivingState('driving');
      cableMesh.visible = false;
      pulseMesh.visible = false;
    };

    // Orbit Controls via Mouse Drag
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetAzimuth = -0.7;
    let targetPolar = 0.45;
    let currentAzimuth = -0.7;
    let currentPolar = 0.45;
    const radius = 6.2;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      targetAzimuth += deltaX * 0.008;
      targetPolar = Math.max(0.15, Math.min(Math.PI * 0.46, targetPolar - deltaY * 0.008));
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Resize Handler
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // 8. 60 FPS Render & Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth Car Drive-In Animation
      if (isDriving) {
        const step = (targetZ - carProgressZ) * 0.045;
        carProgressZ += step;
        carRoot.position.z = carProgressZ;

        // Spin wheels proportional to driving velocity
        const wheelRotSpeed = step * 3.5;
        for (const w of wheels) {
          w.rotation.x += wheelRotSpeed;
        }

        // When arrived at parking mark:
        if (Math.abs(targetZ - carProgressZ) < 0.015) {
          carProgressZ = targetZ;
          carRoot.position.z = targetZ;
          isDriving = false;
          setDrivingState('parked');
          cableMesh.visible = true;
          pulseMesh.visible = true;
        }
      }

      // Update Body Paint dynamically without tearing down scene
      if (bodyMat.color.getHex() !== paintColorRef.current) {
        bodyMat.color.setHex(paintColorRef.current);
      }

      // Orbit camera damping
      currentAzimuth += (targetAzimuth - currentAzimuth) * 0.08;
      currentPolar += (targetPolar - currentPolar) * 0.08;
      camera.position.x = radius * Math.sin(currentAzimuth) * Math.cos(currentPolar);
      camera.position.y = radius * Math.sin(currentPolar);
      camera.position.z = radius * Math.cos(currentAzimuth) * Math.cos(currentPolar);
      camera.lookAt(0, 0.45, 0);

      // Energy Pulse traveling along charging cable into car
      if (!isDriving && isChargingRef.current) {
        const t = (elapsed * 0.8) % 1;
        const pt = cableCurve.getPointAt(t);
        pulseMesh.position.copy(pt);
        pulseMesh.visible = true;

        // Pulsing wallbox halo
        ringMat.color.setHex(0x10b981);
        ringMat.needsUpdate = false;
      } else {
        pulseMesh.visible = false;
        ringMat.color.setHex(0x71717a);
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      bayPadGeo.dispose();
      bayPadMat.dispose();
      stripeMat.dispose();
      postGeo.dispose();
      darkMetalMat.dispose();
      boxGeo.dispose();
      boxMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      hullGeo.dispose();
      bodyMat.dispose();
      cabinGeo.dispose();
      glassMat.dispose();
      headlampGeo.dispose();
      headlampMat.dispose();
      tailGeo.dispose();
      tailMat.dispose();
      tireGeo.dispose();
      tireMat.dispose();
      rimGeo.dispose();
      rimMat.dispose();
      cableGeo.dispose();
      cableMat.dispose();
      pulseGeo.dispose();
      pulseMat.dispose();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        title="Interactive 3D EV Bay — Drag to orbit camera angle"
      />

      {/* Top Floating Badge & Status */}
      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3 py-1 text-xs font-mono shadow-xs backdrop-blur-md">
        <span className={`h-2 w-2 rounded-full ${isCharging ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
        <span className="font-semibold text-zinc-900">
          {drivingState === 'driving' ? 'AUTONOMOUS ARRIVAL DOCKING' : isCharging ? 'METERED 11 kW CHARGE ACTIVE' : 'DOCKED · STANDBY'}
        </span>
      </div>

      {/* Top-Right Paint & Replay Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/95 p-1 shadow-xs backdrop-blur-md">
        {CAR_PAINTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPaintColor(p)}
            title={`Car Paint: ${p.label}`}
            className={`h-4 w-4 rounded-full transition-transform ${paintColor.id === p.id ? 'scale-125 ring-2 ring-emerald-500 ring-offset-1' : 'hover:scale-110'}`}
            style={{ backgroundColor: `#${p.hex.toString(16).padStart(6, '0')}` }}
          />
        ))}

        <div className="h-3 w-px bg-zinc-200 mx-0.5" />

        <button
          type="button"
          onClick={() => replayDriveRef.current()}
          title="Replay EV arrival drive-in animation"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Replay</span>
        </button>
      </div>

      {/* Bottom Floating Telemetry Overlay Bar */}
      <div className="absolute bottom-3 inset-x-3 rounded-xl border border-white/80 bg-white/95 p-3 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
              <Zap className="h-3.5 w-3.5 text-emerald-600" />
              <span>Tesla Model 3 Long Range · 78 kWh</span>
            </div>
            <div className="font-mono text-[11px] text-zinc-500">
              {drivingState === 'driving' ? 'Aligning with Bay 01 Wallbox…' : 'Connected to 22 kW AC Type-2 Wallbox'}
            </div>
          </div>

          <div className="text-right font-mono">
            <div className="text-sm font-bold text-zinc-900 tabular-nums">
              {isCharging ? '11.0 kW' : '0.0 kW'} <span className="text-[10px] text-zinc-500 font-normal">/ 230V · 16A</span>
            </div>
            <div className="text-[10px] text-emerald-700 font-medium tabular-nums">
              {isCharging ? 'Battery 74% (+14.2 kWh)' : 'Plug-in to charge'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
