import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createConfiguredRenderer(
  width: number,
  height: number,
  isSoftwareGl: boolean
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setSize(Math.max(1, width), Math.max(1, height));
  renderer.setPixelRatio(
    isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function attachStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envTarget.texture;
  roomEnv.dispose();
  pmremGenerator.dispose();
  return envTarget.texture;
}

export function createMunichGridTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  // Crisp light architectural ground base
  ctx.fillStyle = '#e8edf4';
  ctx.fillRect(0, 0, size, size);

  // Subtle city block quads
  ctx.fillStyle = '#dfe6ef';
  const blockStep = 128;
  for (let x = 10; x < size; x += blockStep) {
    for (let y = 10; y < size; y += blockStep) {
      ctx.fillRect(x, y, blockStep - 20, blockStep - 20);
    }
  }

  // Primary arterial grid lines
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  for (let i = 0; i <= size; i += blockStep) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Secondary street grid lines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.25;
  for (let i = 64; i < size; i += blockStep) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(14, 14);
  map.anisotropy = Math.max(1, maxAnisotropy);

  // Roughness micro-variation map (linear space)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#d4d4d4';
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 650; i++) {
    const gx = (i * 53) % 256;
    const gy = (i * 97) % 256;
    const v = 185 + ((i * 19) % 45);
    rCtx.fillStyle = `rgb(${v},${v},${v})`;
    rCtx.fillRect(gx, gy, 3, 3);
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(18, 18);
  roughnessMap.anisotropy = Math.max(1, maxAnisotropy);

  return { map, roughnessMap };
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.5
  );
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.48)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.18)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createOledScreenTexture(
  title: string,
  subtitle: string,
  accentHex = '#10b981'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 160);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 240, 144);

  ctx.fillStyle = accentHex;
  ctx.fillRect(20, 22, 10, 24);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(title, 40, 42);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px sans-serif';
  ctx.fillText(subtitle, 20, 82);

  ctx.fillStyle = accentHex;
  ctx.font = 'bold 16px monospace';
  ctx.fillText('OCPP 2.0.1 · READY', 20, 126);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface RenderScheduler {
  requestRender: () => void;
  dispose: () => void;
}

/**
 * Coalesced on-demand & transition-aware render scheduler.
 * Follows software-WebGL afterDraw fence-sync pacing so headless SwiftShader
 * never blocks the main browser thread or Playwright automation.
 */
export function createRenderScheduler(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  isSoftwareGl: boolean,
  onTick: (dt: number) => boolean
): RenderScheduler {
  let disposed = false;
  let renderBusy = false;
  let renderDirty = false;
  let rafId = 0;
  let timerId = 0;
  let lastTime = performance.now();

  const afterDraw = (cb: () => void) => {
    if (disposed) return;
    try {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush?.();
      let polls = 0;
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync?.(sync);
          return;
        }
        polls += 1;
        const state = sync && gl.getSyncParameter?.(sync, gl.SYNC_STATUS);
        if (sync && state === gl.UNSIGNALED && polls < 12) {
          timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync?.(sync);
          timerId = window.setTimeout(cb, 80);
        }
      };
      timerId = window.setTimeout(poll, 5);
    } catch {
      timerId = window.setTimeout(cb, 80);
    }
  };

  const requestRender = () => {
    if (disposed) return;
    if (renderBusy) {
      renderDirty = true;
      return;
    }
    renderBusy = true;
    rafId = window.requestAnimationFrame(() => {
      if (disposed) return;
      renderDirty = false;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const needsAnotherFrame = onTick(dt);
      renderer.render(scene, camera);

      const done = () => {
        renderBusy = false;
        if (disposed) return;
        if (renderDirty || needsAnotherFrame) {
          requestRender();
        }
      };

      if (isSoftwareGl) {
        afterDraw(done);
      } else {
        done();
      }
    });
  };

  const dispose = () => {
    disposed = true;
    window.cancelAnimationFrame(rafId);
    window.clearTimeout(timerId);
  };

  return { requestRender, dispose };
}

export function disposeObjectTree(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }
    if (mesh.material) {
      const matList = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of matList) {
        materials.add(mat);
        for (const val of Object.values(mat)) {
          if (val && typeof val === 'object' && (val as THREE.Texture).isTexture) {
            textures.add(val as THREE.Texture);
          }
        }
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
