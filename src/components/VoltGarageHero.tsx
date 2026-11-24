import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowRight, Compass, TrendingUp, Zap } from 'lucide-react';

interface VoltGarageHeroProps {
  onExploreClick: () => void;
  onHostClick: () => void;
}

export function VoltGarageHero({ onExploreClick, onHostClick }: VoltGarageHeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [chargerState, setChargerState] = useState<'available' | 'charging'>('available');

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 3.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.6);
    mainLight.position.set(4, 6, 5);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0x10b981, 1.2);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);

    const cyanLight = new THREE.PointLight(0x06b6d4, 1.5, 6);
    cyanLight.position.set(0, 0.8, 1.2);
    scene.add(cyanLight);

    // Charger Pedestal Group
    const chargerGroup = new THREE.Group();
    scene.add(chargerGroup);

    // 1. Pedestal Base & Column
    const baseGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.1, 32);
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.8,
      roughness: 0.25,
    });
    const base = new THREE.Mesh(baseGeo, darkMetalMat);
    base.position.y = -1.2;
    chargerGroup.add(base);

    const pillarGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.8, 24);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.6,
      roughness: 0.35,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = -0.3;
    chargerGroup.add(pillar);

    // 2. Wallbox / Pedestal Enclosure
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.1, 0.32);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      metalness: 0.7,
      roughness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    chargerGroup.add(body);

    // Front Anodized Faceplate
    const faceGeo = new THREE.BoxGeometry(0.62, 0.98, 0.04);
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.5,
      roughness: 0.4,
    });
    const faceplate = new THREE.Mesh(faceGeo, faceMat);
    faceplate.position.set(0, 0.55, 0.16);
    chargerGroup.add(faceplate);

    // 3. LED Status Halo Ring
    const ringGeo = new THREE.TorusGeometry(0.18, 0.022, 16, 48);
    const ledMat = new THREE.MeshBasicMaterial({
      color: chargerState === 'available' ? 0x10b981 : 0x06b6d4,
    });
    const ledRing = new THREE.Mesh(ringGeo, ledMat);
    ledRing.position.set(0, 0.72, 0.19);
    chargerGroup.add(ledRing);

    // 4. Digital Telemetry Display on Pedestal
    const screenGeo = new THREE.PlaneGeometry(0.4, 0.22);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x040810 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.42, 0.185);
    chargerGroup.add(screen);

    // 5. Coiled Heavy-Duty Industrial Cable
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.35, 0.4, 0.05),
      new THREE.Vector3(0.45, 0.1, 0.2),
      new THREE.Vector3(0.35, -0.2, 0.1),
      new THREE.Vector3(0.42, -0.6, 0.15),
      new THREE.Vector3(0.25, -0.9, 0.1),
      new THREE.Vector3(0, -1.15, 0.3),
    ]);
    const cableGeo = new THREE.TubeGeometry(cableCurve, 32, 0.04, 12, false);
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.7,
      metalness: 0.1,
    });
    const cable = new THREE.Mesh(cableGeo, cableMat);
    chargerGroup.add(cable);

    // 6. Charging Connector Gun Docked on Side
    const gunGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.3, 16);
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.5,
      roughness: 0.3,
    });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.rotation.z = Math.PI / 4;
    gun.position.set(-0.38, 0.55, 0.1);
    chargerGroup.add(gun);

    // Interactive Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationY = 0;
    let targetRotationX = 0;

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotationY = mouseX * 0.4;
      targetRotationX = -mouseY * 0.2;
    };

    container.addEventListener('mousemove', onPointerMove);

    // Handle Resize
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', onResize);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth damped rotation toward target mouse
      chargerGroup.rotation.y += (targetRotationY - chargerGroup.rotation.y) * 0.05;
      chargerGroup.rotation.x += (targetRotationX - chargerGroup.rotation.x) * 0.05;

      // Gentle floating breathing oscillation
      chargerGroup.position.y = Math.sin(elapsed * 1.5) * 0.03;

      // Pulse LED status light
      const pulse = 0.8 + 0.3 * Math.sin(elapsed * 3);
      if (ledMat.color) {
        cyanLight.intensity = pulse * 1.8;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('resize', onResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      baseGeo.dispose();
      pillarGeo.dispose();
      bodyGeo.dispose();
      faceGeo.dispose();
      ringGeo.dispose();
      screenGeo.dispose();
      cableGeo.dispose();
      gunGeo.dispose();
      darkMetalMat.dispose();
      pillarMat.dispose();
      bodyMat.dispose();
      faceMat.dispose();
      ledMat.dispose();
      screenMat.dispose();
      cableMat.dispose();
      gunMat.dispose();
    };
  }, [chargerState]);

  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white shadow-xl">
      {/* Subtle Background Electric Grid Texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 grid grid-cols-1 items-center gap-8 lg:grid-cols-12 p-6 sm:p-10">
        {/* Left Column: Product Positioning & CTAs */}
        <div className="lg:col-span-7 space-y-5">
          {/* Hardware Badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-3 py-1 text-xs font-mono font-medium text-emerald-400">
              <Zap className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" />
              <span>P2P EV CHARGING INFRASTRUCTURE</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-[11px] font-mono text-zinc-300">
              OCPP 2.0.1 COMPLIANT
            </span>
          </div>

          {/* Main Headline */}
          <div className="space-y-2">
            <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.12]">
              Decentralized EV Charging. <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                Guaranteed Reservations.
              </span>
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl">
              Connect to community residential wallboxes and commercial DC fast hubs. 
              Enjoy 30-minute guaranteed holds, zero-wait QR check-in, and automated metered billing with 10 km geofence protection.
            </p>
          </div>

          {/* Real-World Proof Point Banner (Darshan / Bolt.Earth Case Study) */}
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-300 backdrop-blur-sm max-w-xl">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <span className="font-semibold text-white">Bengaluru Micro-Host Benchmark:</span>{' '}
              Hosts earn up to <span className="font-mono font-semibold text-emerald-400">₹8,000/week</span> on standard 3.3 kW residential connections with zero ongoing staffing required.
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onExploreClick}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-xs sm:text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/30 active:scale-[0.98]"
            >
              <span>Explore Munich Grid</span>
              <Compass className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onHostClick}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/90 px-4 py-2.5 text-xs sm:text-sm font-medium text-white transition-all hover:bg-zinc-700 hover:border-zinc-600 active:scale-[0.98]"
            >
              <span>Calculate Host ROI</span>
              <ArrowRight className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Right Column: Interactive 3D Charging Pedestal Visualizer */}
        <div className="lg:col-span-5 relative flex flex-col items-center justify-center">
          <div
            ref={mountRef}
            className="h-[320px] sm:h-[380px] w-full cursor-grab active:cursor-grabbing"
            title="Interactive 3D EV Pedestal — Move cursor to inspect"
          />

          {/* Pedestal Interactive Floating Telemetry Pill */}
          <div className="mt-2 flex items-center justify-between w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-xs font-mono backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-zinc-400">PEDESTAL 01</span>
            </div>
            <button
              type="button"
              onClick={() => setChargerState((s) => (s === 'available' ? 'charging' : 'available'))}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              {chargerState === 'available' ? 'Simulate Plug-In' : 'Simulate Unplug'}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Technical Specs Ribbon */}
      <div className="border-t border-zinc-800/80 bg-zinc-950/90 px-6 py-3 sm:px-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-emerald-400 font-mono text-[10px]">AC</div>
            <div>
              <div className="text-[10px] uppercase font-mono text-zinc-500">Power Band</div>
              <div className="font-mono font-medium text-zinc-200">3.3 kW – 22 kW</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-cyan-400 font-mono text-[10px]">₹</div>
            <div>
              <div className="text-[10px] uppercase font-mono text-zinc-500">Community Tariff</div>
              <div className="font-mono font-medium text-zinc-200">₹18.00 / kWh</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-teal-400 font-mono text-[10px]">30m</div>
            <div>
              <div className="text-[10px] uppercase font-mono text-zinc-500">Hold Window</div>
              <div className="font-mono font-medium text-zinc-200">Guaranteed Hold</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-emerald-400 font-mono text-[10px]">80%</div>
            <div>
              <div className="text-[10px] uppercase font-mono text-zinc-500">Host Settlement</div>
              <div className="font-mono font-medium text-zinc-200">Automated Payouts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
