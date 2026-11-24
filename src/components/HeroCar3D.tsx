/**
 * HeroCar3D — Dark-studio EV showcase
 * ─────────────────────────────────────────────────────────────
 * Aesthetic goals (unslop):
 *  • Dark obsidian studio (#0d0d12) — no flat grey playground
 *  • Reflective glossy floor with subtle emerald grid lines
 *  • Properly proportioned modern EV sedan (long hood, low roof)
 *  • Soft three-point studio lighting + emerald rim light
 *  • Thin charging arc particle + cable glow
 *  • No boxy shapes — smooth extruded profiles with bevels
 *  • Soft contact shadow / AO beneath car
 *  • Auto-rotating turntable when idle; drag to override
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCcw, Zap } from 'lucide-react';

interface HeroCar3DProps {
  onSessionToggle?: (charging: boolean) => void;
  isCharging?: boolean;
}

const CAR_PAINTS = [
  { id: 'midnight', label: 'Midnight Blue',  hex: 0x0f1f3c },
  { id: 'arctic',   label: 'Arctic White',   hex: 0xf0f4f8 },
  { id: 'obsidian', label: 'Obsidian',        hex: 0x111318 },
  { id: 'emerald',  label: 'Volt Green',      hex: 0x064e3b },
];

export function HeroCar3D({ onSessionToggle, isCharging = true }: HeroCar3DProps) {
  const mountRef      = useRef<HTMLDivElement>(null);
  const [paint, setPaint]         = useState(CAR_PAINTS[0]);
  const [docked, setDocked]       = useState(false);
  const [batteryPct, setBatteryPct] = useState(68);

  const paintRef    = useRef(paint.hex);
  paintRef.current  = paint.hex;

  const chargingRef = useRef(isCharging);
  chargingRef.current = isCharging;

  const replayRef = useRef<() => void>(() => {});

  // Tick battery while charging
  useEffect(() => {
    if (!isCharging || !docked) return;
    const id = setInterval(() => setBatteryPct(p => Math.min(100, p + 1)), 1800);
    return () => clearInterval(id);
  }, [isCharging, docked]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const W = container.clientWidth  || 560;
    const H = container.clientHeight || 340;

    // ── Scene ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0f);
    scene.fog = new THREE.FogExp2(0x0a0b0f, 0.038);

    // ── Camera ───────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 80);
    camera.position.set(-4.8, 2.0, 5.2);
    camera.lookAt(0, 0.6, 0);

    // ── Renderer ─────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled  = true;
    renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
    renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ── Lighting — 3-point studio ────────────────────────────
    // Key: warm overhead
    const key = new THREE.DirectionalLight(0xfff8f0, 2.6);
    key.position.set(4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near   = 1;
    key.shadow.camera.far    = 30;
    key.shadow.camera.left   = -5;
    key.shadow.camera.right  = 5;
    key.shadow.camera.top    = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0005;
    scene.add(key);

    // Fill: cool left bounce
    const fill = new THREE.DirectionalLight(0xc7d9ff, 0.8);
    fill.position.set(-6, 4, 2);
    scene.add(fill);

    // Rim: emerald from behind (the brand accent)
    const rim = new THREE.DirectionalLight(0x10b981, 1.4);
    rim.position.set(-3, 2.5, -6);
    scene.add(rim);

    // Ambient
    const amb = new THREE.HemisphereLight(0x1e2030, 0x000000, 0.6);
    scene.add(amb);

    // ── Reflective Studio Floor ───────────────────────────────
    // Base dark slab
    const floorGeo = new THREE.PlaneGeometry(28, 28);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0d0e12,
      roughness: 0.08,
      metalness: 0.65,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Emerald grid lines on floor (canvas texture)
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width  = 512;
    gridCanvas.height = 512;
    const gc = gridCanvas.getContext('2d')!;
    gc.fillStyle = 'transparent';
    gc.clearRect(0, 0, 512, 512);
    gc.strokeStyle = 'rgba(16,185,129,0.18)';
    gc.lineWidth = 1;
    const step = 512 / 8;
    for (let i = 0; i <= 8; i++) {
      gc.beginPath(); gc.moveTo(i * step, 0); gc.lineTo(i * step, 512); gc.stroke();
      gc.beginPath(); gc.moveTo(0, i * step); gc.lineTo(512, i * step); gc.stroke();
    }
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(4, 4);
    const gridGeo = new THREE.PlaneGeometry(28, 28);
    const gridMat = new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 1, depthWrite: false });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = 0.001;
    scene.add(gridMesh);

    // Charging bay highlight pad
    const padGeo = new THREE.PlaneGeometry(3.2, 6.0);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 1,
      transparent: true,
      opacity: 0.04,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.002;
    scene.add(pad);

    // Bay edge stripes
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.55 });
    for (const sx of [-1.6, 1.6]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 5.6), edgeMat);
      e.rotation.x = -Math.PI / 2;
      e.position.set(sx, 0.003, 0);
      scene.add(e);
    }

    // ── Wallbox Charging Pedestal ─────────────────────────────
    const pedGroup = new THREE.Group();
    pedGroup.position.set(1.35, 0, 2.3);
    scene.add(pedGroup);

    // Slim post
    const pedPostMat = new THREE.MeshStandardMaterial({ color: 0x1a1b22, roughness: 0.25, metalness: 0.9 });
    const pedPost = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.4, 20), pedPostMat);
    pedPost.position.y = 0.7;
    pedPost.castShadow = true;
    pedGroup.add(pedPost);

    // Unit box
    const pedBoxMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0e14, roughness: 0.15, metalness: 0.8, clearcoat: 0.9 });
    const pedBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.52, 0.18), pedBoxMat);
    pedBox.position.y = 1.32;
    pedBox.castShadow = true;
    pedGroup.add(pedBox);

    // Glowing ring on box
    const ringGeo = new THREE.TorusGeometry(0.09, 0.013, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 1.42, 0.1);
    pedGroup.add(ring);

    // Thin vertical LED strip on box
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.36), ledMat);
    led.position.set(0.08, 1.33, 0.092);
    pedGroup.add(led);

    // ── EV Sedan Car ─────────────────────────────────────────
    const carRoot = new THREE.Group();
    scene.add(carRoot);

    // Soft contact shadow
    const aoCanvas = document.createElement('canvas');
    aoCanvas.width = aoCanvas.height = 256;
    const aoCtx = aoCanvas.getContext('2d')!;
    const aoG = aoCtx.createRadialGradient(128, 128, 20, 128, 128, 120);
    aoG.addColorStop(0,   'rgba(0,0,0,0.75)');
    aoG.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    aoG.addColorStop(1,   'rgba(0,0,0,0)');
    aoCtx.fillStyle = aoG;
    aoCtx.fillRect(0, 0, 256, 256);
    const aoTex = new THREE.CanvasTexture(aoCanvas);
    const aoShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 5.6),
      new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false })
    );
    aoShadow.rotation.x = -Math.PI / 2;
    aoShadow.position.y = 0.004;
    carRoot.add(aoShadow);

    // Body material (live paint)
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: paintRef.current,
      roughness: 0.12,
      metalness: 0.80,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.2,
    });

    // Helper to make an extruded panel
    function makePanel(shape: THREE.Shape, depth: number, bevel = 0.06): THREE.BufferGeometry {
      return new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel * 0.9,
        bevelSegments: 3,
      });
    }

    // ── LOWER BODY HULL (sill to shoulder line) ──────────────
    // Profile: proper EV sedan — long, low, slight fastback slope
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.10, 0.22);  // rear lower sill
    hullShape.bezierCurveTo(-2.10, 0.22, -2.08, 0.58, -1.70, 0.60); // rear haunch
    hullShape.lineTo(1.75, 0.60);   // shoulder line
    hullShape.bezierCurveTo(2.08, 0.60, 2.12, 0.46, 2.12, 0.30); // front nose
    hullShape.lineTo(2.12, 0.22);
    hullShape.closePath();

    const hullGeo = makePanel(hullShape, 1.42, 0.07);
    hullGeo.translate(0, 0, -0.71);
    hullGeo.rotateY(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, bodyMat);
    hull.position.y = 0.0;
    hull.castShadow = true;
    carRoot.add(hull);

    // ── ROOF / FASTBACK GLASS ZONE ──────────────────────────
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.65, 0.60);  // rear C-pillar base
    roofShape.bezierCurveTo(-1.60, 0.62, -1.30, 1.22, -0.80, 1.22); // roofline
    roofShape.lineTo(0.90, 1.22);
    roofShape.bezierCurveTo(1.35, 1.22, 1.68, 0.78, 1.72, 0.60);
    roofShape.lineTo(-1.65, 0.60);
    roofShape.closePath();

    const roofGeo = makePanel(roofShape, 1.28, 0.05);
    roofGeo.translate(0, 0, -0.64);
    roofGeo.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.y = 0.0;
    roof.castShadow = true;
    carRoot.add(roof);

    // ── PANORAMIC GLASS (blue tinted) ─────────────────────
    const glassShape = new THREE.Shape();
    glassShape.moveTo(-1.44, 0.65);
    glassShape.bezierCurveTo(-1.40, 0.68, -1.15, 1.17, -0.76, 1.17);
    glassShape.lineTo(0.86, 1.17);
    glassShape.bezierCurveTo(1.26, 1.17, 1.52, 0.78, 1.55, 0.65);
    glassShape.lineTo(-1.44, 0.65);
    glassShape.closePath();

    const glassGeo = makePanel(glassShape, 1.14, 0.04);
    glassGeo.translate(0, 0, -0.57);
    glassGeo.rotateY(Math.PI / 2);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e3a5f,
      roughness: 0.03,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55,
      clearcoat: 1.0,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    carRoot.add(glass);

    // ── A/B/C PILLARS (dark structural) ─────────────────────
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5, metalness: 0.3 });
    const pillarsData: [number, number, number, number][] = [
      // [x, y, w, h]
      [1.54, 0.90, 0.09, 0.60],  // A-pillar front
      [-1.42, 0.90, 0.09, 0.60], // C-pillar rear
      [0.08, 1.14, 0.08, 0.14],  // B-pillar mid roof
    ];
    for (const [px, py, pw, ph] of pillarsData) {
      const pMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, ph, pw), pillarMat);
      pMesh.position.set(py - 0.3, py, px - 0.5);
      // skip per-pillar for now — simple approach via geometry is enough
    }

    // ── FRONT BUMPER FASCIA ──────────────────────────────────
    const noseShape = new THREE.Shape();
    noseShape.moveTo(2.08, 0.18);
    noseShape.bezierCurveTo(2.14, 0.18, 2.22, 0.30, 2.22, 0.42);
    noseShape.lineTo(2.22, 0.56);
    noseShape.lineTo(2.08, 0.58);
    noseShape.closePath();
    const noseGeo = makePanel(noseShape, 1.30, 0.04);
    noseGeo.translate(0, 0, -0.65);
    noseGeo.rotateY(Math.PI / 2);
    const noseAccentMat = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.3, metalness: 0.6 });
    const nose = new THREE.Mesh(noseGeo, noseAccentMat);
    carRoot.add(nose);

    // ── FULL-WIDTH LED HEADLAMP BAR ──────────────────────────
    const headGeo = new THREE.BoxGeometry(1.26, 0.05, 0.04);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xe8f4ff,
      emissive: 0x9ecfff,
      emissiveIntensity: 2.8,
    });
    const headlamp = new THREE.Mesh(headGeo, headMat);
    headlamp.position.set(0, 0.50, 2.17);
    carRoot.add(headlamp);

    // ── FULL-WIDTH TAIL LAMP BAR ─────────────────────────────
    const tailGeo = new THREE.BoxGeometry(1.30, 0.045, 0.04);
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0xcc1133,
      emissiveIntensity: 2.2,
    });
    const taillamp = new THREE.Mesh(tailGeo, tailMat);
    taillamp.position.set(0, 0.56, -2.16);
    carRoot.add(taillamp);

    // ── LOWER ROCKER PANELS + SIDE SKIRTS ───────────────────
    const rockerMat = new THREE.MeshStandardMaterial({ color: 0x111218, roughness: 0.5, metalness: 0.4 });
    for (const rz of [-0.70, 0.70]) {
      const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 4.0), rockerMat);
      rocker.position.set(rz, 0.22, 0);
      carRoot.add(rocker);
    }

    // ── WHEELS × 4 ───────────────────────────────────────────
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.95 });
    const rimMat  = new THREE.MeshStandardMaterial({ color: 0xd0d8e8, roughness: 0.12, metalness: 0.9 });
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0xc8d2e0, roughness: 0.15, metalness: 0.9 });

    const wheels: THREE.Group[] = [];
    const wheelPos: [number, number][] = [
      [-0.75, 1.30], [0.75, 1.30],
      [-0.75, -1.30], [0.75, -1.30],
    ];

    for (const [wx, wz] of wheelPos) {
      const wg = new THREE.Group();
      wg.position.set(wx, 0.36, wz);

      // Fat tyre
      const tyre = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.36, 0.22, 32).rotateZ(Math.PI / 2),
        tireMat
      );
      tyre.castShadow = true;
      wg.add(tyre);

      // Rim dish
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.23, 24).rotateZ(Math.PI / 2),
        rimMat
      );
      wg.add(rim);

      // 5 aerodynamic spokes
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.05, 0.04),
          spokeMat
        );
        spoke.rotation.z = (s / 5) * Math.PI * 2;
        spoke.position.x = wx < 0 ? -0.11 : 0.11;
        wg.add(spoke);
      }

      carRoot.add(wg);
      wheels.push(wg);
    }

    // ── CHARGING CABLE ────────────────────────────────────────
    const cablePoints = [
      new THREE.Vector3(1.35, 1.1, 2.3),
      new THREE.Vector3(1.25, 0.55, 1.8),
      new THREE.Vector3(1.05, 0.28, 1.0),
      new THREE.Vector3(0.84, 0.44, 0.35),
    ];
    const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
    const cableGeo   = new THREE.TubeGeometry(cableCurve, 32, 0.022, 10, false);
    const cableMat   = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.6, metalness: 0.3 });
    const cable      = new THREE.Mesh(cableGeo, cableMat);
    cable.visible    = false;
    scene.add(cable);

    // Energy pulse bead
    const pulseMat  = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const pulseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), pulseMat);
    pulseMesh.visible = false;
    scene.add(pulseMesh);

    // Charge-port glow halo
    const portHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.0 })
    );
    portHalo.position.set(0.84, 0.44, 0.35);
    scene.add(portHalo);

    // ── CAR DRIVE-IN ANIMATION ───────────────────────────────
    let carZ       = -7.0;
    const targetZ  = 0.0;
    let isDriving  = true;

    replayRef.current = () => {
      carZ      = -7.0;
      isDriving = true;
      setDocked(false);
      setBatteryPct(68);
      cable.visible     = false;
      pulseMesh.visible = false;
      (portHalo.material as THREE.MeshBasicMaterial).opacity = 0;
    };

    // ── ORBIT CONTROLS ───────────────────────────────────────
    let pointerDown = false;
    let pX = 0, pY = 0;
    let azTarget = -0.6, polTarget = 0.42;
    let azCur    = -0.6, polCur    = 0.42;
    let autoRotate = true;
    const orbitR   = 7.0;

    const onDown = (e: MouseEvent | TouchEvent) => {
      pointerDown  = true;
      autoRotate   = false;
      const src = 'touches' in e ? e.touches[0] : e;
      pX = src.clientX; pY = src.clientY;
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!pointerDown) return;
      const src = 'touches' in e ? e.touches[0] : e;
      azTarget  += (src.clientX - pX) * 0.007;
      polTarget  = Math.max(0.18, Math.min(1.1, polTarget - (src.clientY - pY) * 0.007));
      pX = src.clientX; pY = src.clientY;
    };
    const onUp = () => {
      pointerDown = false;
      // Resume auto-rotate after 3s idle
      setTimeout(() => { autoRotate = true; }, 3000);
    };

    container.addEventListener('mousedown',  onDown as EventListener);
    container.addEventListener('touchstart', onDown as EventListener, { passive: true });
    window.addEventListener('mousemove',  onMove as EventListener);
    window.addEventListener('touchmove',  onMove as EventListener, { passive: true });
    window.addEventListener('mouseup',    onUp);
    window.addEventListener('touchend',   onUp);

    // ── RESIZE ───────────────────────────────────────────────
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── RENDER LOOP ───────────────────────────────────────────
    let animId: number;
    const clock  = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Drive-in
      if (isDriving) {
        const step = (targetZ - carZ) * 0.038;
        carZ += step;
        carRoot.position.z = carZ;
        for (const w of wheels) w.rotation.x += step * 3.2;
        if (Math.abs(targetZ - carZ) < 0.012) {
          carZ = targetZ;
          carRoot.position.z = 0;
          isDriving          = false;
          setDocked(true);
          cable.visible      = true;
          pulseMesh.visible  = true;
        }
      }

      // Live paint update
      (bodyMat.color as THREE.Color).setHex(paintRef.current);

      // Auto-turntable
      if (autoRotate && !isDriving) {
        azTarget = -0.6 + t * 0.12;
      }

      // Orbit damping
      azCur  += (azTarget  - azCur)  * 0.07;
      polCur += (polTarget - polCur) * 0.07;
      camera.position.set(
        orbitR * Math.sin(azCur)  * Math.cos(polCur),
        orbitR * Math.sin(polCur),
        orbitR * Math.cos(azCur)  * Math.cos(polCur)
      );
      camera.lookAt(0, 0.6, 0);

      // Charging FX
      if (!isDriving && chargingRef.current) {
        const u     = (t * 0.75) % 1;
        const pt    = cableCurve.getPointAt(u);
        pulseMesh.position.copy(pt);
        pulseMesh.visible = true;

        // Port halo pulse
        const haloMat = portHalo.material as THREE.MeshBasicMaterial;
        haloMat.opacity = 0.3 + 0.25 * Math.sin(t * 5);

        // Wallbox ring flicker
        ringMat.color.setHex(0x10b981);
        led.visible = Math.sin(t * 8) > -0.3;

        // Battery LED strip colour based on level
        (ledMat.color as THREE.Color).setHex(0x34d399);
      } else {
        pulseMesh.visible = false;
        (portHalo.material as THREE.MeshBasicMaterial).opacity = 0;
        ringMat.color.setHex(0x374151);
      }

      // Idle headlamp flicker when parked
      if (!isDriving) {
        const hInt = 2.6 + 0.3 * Math.sin(t * 2.1);
        (headMat as THREE.MeshStandardMaterial).emissiveIntensity = hInt;
      }

      renderer.render(scene, camera);
    };
    animate();

    // ── CLEANUP ───────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousedown',  onDown as EventListener);
      container.removeEventListener('touchstart', onDown as EventListener);
      window.removeEventListener('mousemove',  onMove as EventListener);
      window.removeEventListener('touchmove',  onMove as EventListener);
      window.removeEventListener('mouseup',    onUp);
      window.removeEventListener('touchend',   onUp);
      window.removeEventListener('resize',     onResize);
      renderer.dispose();
      bodyMat.dispose();
      glassMat.dispose();
      cableMat.dispose();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden select-none bg-[#0a0b0f]">
      {/* WebGL Canvas */}
      <div
        ref={mountRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        title="Drag to orbit · 3D live EV charging bay"
      />

      {/* Top-left: live status pill */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1 backdrop-blur-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            docked && isCharging ? 'bg-emerald-400 animate-pulse' : docked ? 'bg-zinc-500' : 'bg-amber-400 animate-pulse'
          }`}
        />
        <span className="font-mono text-[11px] font-semibold tracking-wide text-white/90">
          {!docked
            ? 'AUTONOMOUS APPROACH'
            : isCharging
            ? 'METERED · 11 kW ACTIVE'
            : 'DOCKED · STANDBY'}
        </span>
      </div>

      {/* Top-right: paint swatches + replay */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-2 py-1.5 backdrop-blur-sm">
        {CAR_PAINTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPaint(p)}
            title={p.label}
            className={`h-4 w-4 rounded-full border-2 transition-all ${
              paint.id === p.id
                ? 'border-emerald-400 scale-125'
                : 'border-white/20 hover:border-white/60 hover:scale-110'
            }`}
            style={{ backgroundColor: `#${p.hex.toString(16).padStart(6, '0')}` }}
          />
        ))}
        <div className="mx-1 h-3 w-px bg-white/20" />
        <button
          type="button"
          onClick={() => replayRef.current()}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Replay</span>
        </button>
      </div>

      {/* Bottom: telemetry strip */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 border-t border-white/8 bg-black/75 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <div className="font-semibold text-white/90 truncate">
                Tesla Model 3 Long Range · 78 kWh
              </div>
              <div className="font-mono text-[10px] text-white/45">
                {docked ? '22 kW AC Type-2 Wallbox · Bay 01' : 'Aligning with Bay 01 Wallbox…'}
              </div>
            </div>
          </div>

          {docked && (
            <div className="shrink-0 text-right font-mono">
              <div className="text-sm font-bold tabular-nums text-white">
                {isCharging ? '11.0 kW' : '0.0 kW'}
                <span className="text-[10px] font-normal text-white/40 ml-1">/ 230V · 16A</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-medium tabular-nums">
                {isCharging ? `Battery ${batteryPct}% (+${(14.2 + (batteryPct - 68) * 0.3).toFixed(1)} kWh)` : 'Plug in to start charging'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag hint — fades after 3s via CSS animation */}
      <div className="pointer-events-none absolute bottom-14 right-4 font-mono text-[9px] text-white/25 animate-[fadeout_3s_ease_2s_forwards]">
        Drag to rotate
      </div>
    </div>
  );
}
