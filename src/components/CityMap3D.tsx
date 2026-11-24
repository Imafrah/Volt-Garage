import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Car,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Eye,
  LocateFixed,
  Minus,
  Moon,
  Navigation,
  Plus,
  RotateCcw,
  Sun,
  Sunset,
} from 'lucide-react';
import {
  PROXIMITY_RADIUS_KM,
  calculateDistanceKm,
  estimateEtaMinutes,
} from '../domain/imchargeEngine';
import type { ChargingPoint, GeoPoint } from '../domain/types';
import {
  type MapCameraPreset,
  type Vec3Tuple,
  clampWorldPointToStage,
  computeCameraPresetPose,
  geoToWorld3D,
  getStationAvailabilityState,
  kmToWorldUnits,
  sampleRouteArc,
  world3DToGeo,
} from '../three/mapProjection';
import {
  type ChargerTowerRefs,
  buildChargerTowerGroup,
  buildEvVehicleGroup,
  buildMunichUrbanContext,
} from '../three/models';
import {
  type ManualDriveState,
  findRoadPath,
  snapPointToRoad,
  stepManualDrive,
} from '../three/roadNetwork';
import {
  attachStudioEnvironment,
  createConfiguredRenderer,
  createContactShadowTexture,
  createMunichGridTextures,
  createRenderScheduler,
  detectSoftwareWebGL,
  disposeObjectTree,
} from '../three/webglUtils';

export type MapAestheticTheme = 'day' | 'sunset' | 'cyber';

interface CityMap3DProps {
  points: ChargingPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  driverLocation: GeoPoint;
  radiusKm: number;
  onMoveDriverLocation?: (
    location: GeoPoint,
    sourceLabel?: string
  ) => Promise<void> | void;
}

// Reusable scratch math objects (zero GC in render loop)
const _targetCamPos = new THREE.Vector3();
const _targetCtrlPos = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeHit = new THREE.Vector3();

export function CityMap3D({
  points,
  selectedId,
  onSelect,
  driverLocation,
  radiusKm,
  onMoveDriverLocation,
}: CityMap3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraPreset, setCameraPreset] = useState<MapCameraPreset>('iso');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [aestheticTheme, setAestheticTheme] = useState<MapAestheticTheme>('day');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);
  const [currentRoadName, setCurrentRoadName] = useState<string>(
    () => snapPointToRoad(geoToWorld3D(driverLocation).x, geoToWorld3D(driverLocation).z).segment.name
  );
  const [isDriving, setIsDriving] = useState(false);
  const [evTelemetryAttrs, setEvTelemetryAttrs] = useState(() => {
    const p = geoToWorld3D(driverLocation);
    return { x: p.x.toFixed(2), z: p.z.toFixed(2) };
  });

  // Refs synced into the persistent Three.js lifecycle without tearing down WebGL
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onMoveDriverRef = useRef(onMoveDriverLocation);
  onMoveDriverRef.current = onMoveDriverLocation;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const driverLocRef = useRef(driverLocation);
  driverLocRef.current = driverLocation;
  const radiusKmRef = useRef(radiusKm);
  radiusKmRef.current = radiusKm;
  const hoveredIdRef = useRef<string | null>(null);
  const cameraPresetRef = useRef<MapCameraPreset>(cameraPreset);
  cameraPresetRef.current = cameraPreset;

  // Prevent feedback loops between local 3D driving and echoed backend snapshots
  const lastEmittedGeoRef = useRef<GeoPoint | null>(null);
  const isDrivingActiveRef = useRef(false);

  const sceneActionsRef = useRef<{
    syncSceneData: (externalMove: boolean) => void;
    applyCameraPreset: (preset: MapCameraPreset) => void;
    zoomStep: (factor: number) => void;
    setAestheticTheme: (theme: MapAestheticTheme) => void;
    setControlInput: (
      key: 'forward' | 'backward' | 'left' | 'right',
      active: boolean,
      pulseMs?: number
    ) => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createConfiguredRenderer(
        container.clientWidth || 720,
        container.clientHeight || 400,
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
    const horizonHex = 0xe8edf4;
    scene.background = new THREE.Color(horizonHex);
    scene.fog = new THREE.FogExp2(horizonHex, 0.0062);

    const camera = new THREE.PerspectiveCamera(
      42,
      (container.clientWidth || 720) / (container.clientHeight || 400),
      0.5,
      260
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.18;
    controls.minDistance = 12;
    controls.maxDistance = 115;

    // Studio RoomEnvironment + Warm Key / Cool Hemisphere Fill
    const envTex = attachStudioEnvironment(renderer, scene);
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x94a3b8, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
    keyLight.position.set(28, 46, 26);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -52;
    keyLight.shadow.camera.right = 52;
    keyLight.shadow.camera.top = 52;
    keyLight.shadow.camera.bottom = -52;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 135;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xe0f2fe, 0.55);
    rimLight.position.set(-30, 18, -28);
    scene.add(rimLight);

    // Urban terrain, asphalt road network & textures
    const gridTextures = createMunichGridTextures(
      renderer.capabilities.getMaxAnisotropy()
    );
    const shadowTexture = createContactShadowTexture();
    const urbanContext = buildMunichUrbanContext(gridTextures);
    scene.add(urbanContext);

    // Driver EV group (8-part composite with rotating wheel pivots)
    const evGroup = buildEvVehicleGroup(shadowTexture, isSoftwareGl);
    scene.add(evGroup);
    const evWheels = (evGroup.userData.wheels as THREE.Group[]) ?? [];

    // Forward Headlight Beam on Driver EV (activated in Sunset & Cyber modes)
    const evHeadlight = new THREE.SpotLight(0xfef08a, 0, 26, Math.PI / 4.5, 0.45);
    evHeadlight.position.set(0, 0.65, 1.8);
    const headlightTarget = new THREE.Object3D();
    headlightTarget.position.set(0, 0.05, 16);
    evGroup.add(evHeadlight);
    evGroup.add(headlightTarget);
    evHeadlight.target = headlightTarget;

    // Road click destination beacon ring + street path preview
    const destRingGeo = new THREE.RingGeometry(0.65, 1.05, 28);
    destRingGeo.rotateX(-Math.PI / 2);
    const destRingMat = new THREE.MeshBasicMaterial({
      color: 0x059669,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const destRingMesh = new THREE.Mesh(destRingGeo, destRingMat);
    destRingMesh.visible = false;
    scene.add(destRingMesh);

    // 10 km Geofence Ground Disc + Elevated Ring
    const geofenceGroup = new THREE.Group();
    const geofenceDiscGeo = new THREE.CircleGeometry(1, 64);
    geofenceDiscGeo.rotateX(-Math.PI / 2);
    const geofenceDiscMat = new THREE.MeshBasicMaterial({
      color: 0x059669,
      transparent: true,
      opacity: 0.065,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const geofenceDisc = new THREE.Mesh(geofenceDiscGeo, geofenceDiscMat);
    geofenceDisc.position.y = 0.028;
    geofenceGroup.add(geofenceDisc);

    const geofenceRimGeo = new THREE.RingGeometry(0.985, 1.0, 64);
    geofenceRimGeo.rotateX(-Math.PI / 2);
    const geofenceRimMat = new THREE.MeshBasicMaterial({
      color: 0x059669,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const geofenceRim = new THREE.Mesh(geofenceRimGeo, geofenceRimMat);
    geofenceRim.position.y = 0.048;
    geofenceGroup.add(geofenceRim);
    scene.add(geofenceGroup);

    // Stations container
    const stationsGroup = new THREE.Group();
    scene.add(stationsGroup);
    const stationRefs = new Map<string, ChargerTowerRefs>();
    let clickableMeshes: THREE.Mesh[] = [];

    // Route arc group (EV -> selected charger)
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);
    let routeMesh: THREE.Mesh | null = null;
    const routeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x059669,
      emissiveIntensity: 0.45,
      roughness: 0.3,
    });

    // EV Road Driving State
    const getDriverStagePos = () =>
      clampWorldPointToStage(geoToWorld3D(driverLocRef.current), 58).position;

    const getStationStagePos = (pt: ChargingPoint) =>
      clampWorldPointToStage(geoToWorld3D(pt.location), 56).position;

    const initWorld = getDriverStagePos();
    const initSnap = snapPointToRoad(initWorld.x, initWorld.z);
    const driveState: ManualDriveState = {
      x: initWorld.x,
      z: initWorld.z,
      yaw: Math.PI, // Facing North along Ludwigstraße
      speed: 0,
    };

    const targetEvPos = new THREE.Vector3(initWorld.x, initSnap.y, initWorld.z);
    let autopilotWaypoints: Vec3Tuple[] = [];
    let targetGeofenceRadius = kmToWorldUnits(radiusKmRef.current);
    let cameraTransitionActive = false;
    let followEvCamera = false;

    // Keyboard & UI hold state
    const inputFlags = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    };
    const pulseTimers: Partial<Record<keyof typeof inputFlags, number>> = {};

    let lastLocationSyncAt = 0;
    let lastHudUpdateAt = 0;
    let lastSyncedPos = { x: driveState.x, z: driveState.z };

    const emitDriverGeo = (force: boolean, roadName: string) => {
      const now = performance.now();
      const movedSinceSync = Math.hypot(
        driveState.x - lastSyncedPos.x,
        driveState.z - lastSyncedPos.z
      );
      if (!force && (movedSinceSync < 0.85 || now - lastLocationSyncAt < 380)) {
        return;
      }
      if (movedSinceSync < 0.05 && !force) return;

      lastLocationSyncAt = now;
      lastSyncedPos = { x: driveState.x, z: driveState.z };
      const geo = world3DToGeo({ x: driveState.x, z: driveState.z });
      lastEmittedGeoRef.current = geo;
      onMoveDriverRef.current?.(geo, roadName);
    };

    const rebuildRouteArc = () => {
      if (routeMesh) {
        routeGroup.remove(routeMesh);
        routeMesh.geometry.dispose();
        routeMesh = null;
      }
      const sel = pointsRef.current.find((p) => p.id === selectedIdRef.current);
      if (!sel) return;
      const start = { x: driveState.x, y: evGroup.position.y, z: driveState.z };
      const end = getStationStagePos(sel);
      const sampled = sampleRouteArc(start, end, 22);
      const curve = new THREE.CatmullRomCurve3(
        sampled.map((v) => new THREE.Vector3(v.x, v.y, v.z))
      );
      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.14, 6, false);
      routeMesh = new THREE.Mesh(tubeGeo, routeMat);
      routeGroup.add(routeMesh);
    };

    const syncSceneData = (externalMove: boolean) => {
      targetGeofenceRadius = kmToWorldUnits(radiusKmRef.current);

      if (externalMove) {
        const incoming = driverLocRef.current;
        const lastEmitted = lastEmittedGeoRef.current;
        const isEchoFromSelf =
          lastEmitted &&
          Math.abs(incoming.lat - lastEmitted.lat) < 0.0008 &&
          Math.abs(incoming.lon - lastEmitted.lon) < 0.0008;

        if (!isEchoFromSelf && !isDrivingActiveRef.current) {
          const driverPos = getDriverStagePos();
          const snap = snapPointToRoad(driverPos.x, driverPos.z);
          autopilotWaypoints = [];
          destRingMesh.visible = false;
          driveState.x = driverPos.x;
          driveState.z = driverPos.z;
          driveState.speed = 0;
          targetEvPos.set(driverPos.x, snap.y, driverPos.z);
          lastSyncedPos = { x: driverPos.x, z: driverPos.z };
          setCurrentRoadName(snap.segment.name);
          setEvTelemetryAttrs({
            x: driverPos.x.toFixed(2),
            z: driverPos.z.toFixed(2),
          });
        }
      }

      // Rebuild station towers cleanly
      stationRefs.forEach((ref) => {
        stationsGroup.remove(ref.group);
        disposeObjectTree(ref.group);
      });
      stationRefs.clear();
      clickableMeshes = [];

      for (const pt of pointsRef.current) {
        const state = getStationAvailabilityState(
          pt,
          driverLocRef.current,
          PROXIMITY_RADIUS_KM
        );
        const isSel = pt.id === selectedIdRef.current;
        const tower = buildChargerTowerGroup(
          pt,
          shadowTexture,
          state.colorHex,
          isSel
        );
        const worldPos = getStationStagePos(pt);
        tower.group.position.set(worldPos.x, 0, worldPos.z);
        stationsGroup.add(tower.group);
        stationRefs.set(pt.id, tower);
        clickableMeshes.push(tower.hitMesh);
      }

      rebuildRouteArc();
      scheduler.requestRender();
    };

    const applyCameraPreset = (preset: MapCameraPreset) => {
      const dPos = { x: driveState.x, y: evGroup.position.y, z: driveState.z };
      const sel = pointsRef.current.find((p) => p.id === selectedIdRef.current);
      const cPos = sel ? getStationStagePos(sel) : null;
      const pose = computeCameraPresetPose(preset, dPos, cPos);
      _targetCamPos.set(pose.position.x, pose.position.y, pose.position.z);
      _targetCtrlPos.set(pose.target.x, pose.target.y, pose.target.z);
      cameraTransitionActive = true;
      followEvCamera = preset === 'driver';
      scheduler.requestRender();
    };

    const zoomStep = (factor: number) => {
      cameraTransitionActive = false;
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(factor);
      const len = THREE.MathUtils.clamp(
        offset.length(),
        controls.minDistance,
        controls.maxDistance
      );
      offset.setLength(len);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      scheduler.requestRender();
    };

    const setControlInput = (
      key: keyof typeof inputFlags,
      active: boolean,
      pulseMs?: number
    ) => {
      if (pulseTimers[key]) {
        window.clearTimeout(pulseTimers[key]);
        delete pulseTimers[key];
      }
      inputFlags[key] = active;
      if (active) {
        autopilotWaypoints = [];
        destRingMesh.visible = false;
        isDrivingActiveRef.current = true;
        setIsDriving(true);
        scheduler.requestRender();
      }
      if (active && pulseMs && pulseMs > 0) {
        pulseTimers[key] = window.setTimeout(() => {
          inputFlags[key] = false;
          delete pulseTimers[key];
          scheduler.requestRender();
        }, pulseMs);
      }
    };

    // Initial pose (no snap animation on mount)
    evGroup.position.set(initWorld.x, initSnap.y, initWorld.z);
    evGroup.rotation.y = driveState.yaw;
    geofenceGroup.position.set(initWorld.x, 0, initWorld.z);
    geofenceGroup.scale.set(
      kmToWorldUnits(radiusKmRef.current),
      1,
      kmToWorldUnits(radiusKmRef.current)
    );
    const initPose = computeCameraPresetPose('iso', initWorld, null);
    camera.position.set(
      initPose.position.x,
      initPose.position.y,
      initPose.position.z
    );
    controls.target.set(
      initPose.target.x,
      initPose.target.y,
      initPose.target.z
    );
    controls.update();

    const scheduler = createRenderScheduler(
      renderer,
      scene,
      camera,
      isSoftwareGl,
      (dt) => {
        let animating = false;
        const effectiveDt = isSoftwareGl ? Math.max(dt, 0.075) : dt;

        const throttle =
          (inputFlags.forward ? 1 : 0) - (inputFlags.backward ? 1 : 0);
        const steer = (inputFlags.left ? 1 : 0) - (inputFlags.right ? 1 : 0);
        const hasManualInput = throttle !== 0 || steer !== 0;

        let movedThisFrame = 0;
        let currentSnap = snapPointToRoad(driveState.x, driveState.z);

        if (hasManualInput || Math.abs(driveState.speed) > 0.08) {
          // Manual WASD / Arrow / Dock Drive along Munich road network
          autopilotWaypoints = [];
          destRingMesh.visible = false;
          const stepResult = stepManualDrive(
            driveState,
            { throttle, steer },
            effectiveDt
          );
          driveState.x = stepResult.next.x;
          driveState.z = stepResult.next.z;
          driveState.yaw = stepResult.next.yaw;
          driveState.speed = stepResult.next.speed;
          currentSnap = stepResult.snap;
          movedThisFrame = stepResult.distanceMoved;

          targetEvPos.set(driveState.x, currentSnap.y, driveState.z);
          evGroup.position.copy(targetEvPos);
          evGroup.rotation.y = driveState.yaw;
          geofenceGroup.position.set(driveState.x, 0, driveState.z);

          animating = true;
          isDrivingActiveRef.current = true;
        } else if (autopilotWaypoints.length > 0) {
          // Click-to-Drive along Dijkstra road path
          const nextWp = autopilotWaypoints[0];
          const dx = nextWp.x - driveState.x;
          const dz = nextWp.z - driveState.z;
          const dist = Math.hypot(dx, dz);
          const autoSpeed = isSoftwareGl ? 18 : 13;
          const stepDist = Math.min(dist, autoSpeed * effectiveDt);

          if (dist > 0.05) {
            const desiredYaw = Math.atan2(dx, dz);
            const yawDiff = Math.atan2(
              Math.sin(desiredYaw - driveState.yaw),
              Math.cos(desiredYaw - driveState.yaw)
            );
            driveState.yaw += yawDiff * Math.min(1, effectiveDt * 12);
            driveState.x += (dx / dist) * stepDist;
            driveState.z += (dz / dist) * stepDist;
            movedThisFrame = stepDist;
            currentSnap = snapPointToRoad(driveState.x, driveState.z);
            targetEvPos.set(driveState.x, currentSnap.y, driveState.z);
            evGroup.position.copy(targetEvPos);
            evGroup.rotation.y = driveState.yaw;
            geofenceGroup.position.set(driveState.x, 0, driveState.z);
          }

          if (dist - stepDist < 0.35) {
            autopilotWaypoints.shift();
          }
          if (autopilotWaypoints.length === 0) {
            destRingMesh.visible = false;
            isDrivingActiveRef.current = false;
            setIsDriving(false);
            setCurrentRoadName(currentSnap.segment.name);
            setEvTelemetryAttrs({
              x: driveState.x.toFixed(2),
              z: driveState.z.toFixed(2),
            });
            rebuildRouteArc();
            emitDriverGeo(true, currentSnap.segment.name);
          } else {
            animating = true;
            isDrivingActiveRef.current = true;
          }
        } else {
          // Stopped cleanly; settle if transitioning from preset
          if (isDrivingActiveRef.current) {
            isDrivingActiveRef.current = false;
            setIsDriving(false);
            setCurrentRoadName(currentSnap.segment.name);
            setEvTelemetryAttrs({
              x: driveState.x.toFixed(2),
              z: driveState.z.toFixed(2),
            });
            rebuildRouteArc();
            emitDriverGeo(true, currentSnap.segment.name);
          }

          if (evGroup.position.distanceToSquared(targetEvPos) > 0.002) {
            if (isSoftwareGl) {
              evGroup.position.copy(targetEvPos);
            } else {
              evGroup.position.x = THREE.MathUtils.damp(
                evGroup.position.x,
                targetEvPos.x,
                8,
                dt
              );
              evGroup.position.z = THREE.MathUtils.damp(
                evGroup.position.z,
                targetEvPos.z,
                8,
                dt
              );
              evGroup.position.y = THREE.MathUtils.damp(
                evGroup.position.y,
                targetEvPos.y,
                8,
                dt
              );
              animating = true;
            }
            geofenceGroup.position.set(
              evGroup.position.x,
              0,
              evGroup.position.z
            );
          } else {
            evGroup.position.copy(targetEvPos);
            geofenceGroup.position.set(targetEvPos.x, 0, targetEvPos.z);
          }
        }

        // Spin EV wheels proportionally to distance rolled
        if (movedThisFrame > 0.001) {
          const wheelSpin = movedThisFrame / 0.29;
          for (const w of evWheels) {
            w.rotation.x += wheelSpin;
          }

          // Camera chase follow when "Follow EV" mode is active
          if (followEvCamera && !cameraTransitionActive) {
            const camShiftX =
              driveState.x - controls.target.x;
            const camShiftZ =
              driveState.z - controls.target.z;
            controls.target.x += camShiftX * Math.min(1, effectiveDt * 6);
            controls.target.z += camShiftZ * Math.min(1, effectiveDt * 6);
            camera.position.x += camShiftX * Math.min(1, effectiveDt * 6);
            camera.position.z += camShiftZ * Math.min(1, effectiveDt * 6);
          }

          // Throttled HUD + Backend Geofence Coordinate Sync
          const now = performance.now();
          if (now - lastHudUpdateAt > 180) {
            lastHudUpdateAt = now;
            setCurrentRoadName(currentSnap.segment.name);
            setEvTelemetryAttrs({
              x: driveState.x.toFixed(2),
              z: driveState.z.toFixed(2),
            });
            rebuildRouteArc();
          }
          emitDriverGeo(false, currentSnap.segment.name);
        }

        // Smooth geofence radius
        if (Math.abs(geofenceGroup.scale.x - targetGeofenceRadius) > 0.02) {
          const nextR = THREE.MathUtils.damp(
            geofenceGroup.scale.x,
            targetGeofenceRadius,
            9,
            dt
          );
          geofenceGroup.scale.set(nextR, 1, nextR);
          animating = true;
        }

        // Smooth station hover/select elevation
        stationRefs.forEach((tower, id) => {
          const isSel = id === selectedIdRef.current;
          const isHov = id === hoveredIdRef.current;
          const goalY = isSel ? 0.28 : isHov ? 0.18 : 0;
          const goalScale = isSel ? 1.18 : isHov ? 1.1 : 1.0;

          if (Math.abs(tower.towerBody.position.y - goalY) > 0.005) {
            tower.towerBody.position.y = THREE.MathUtils.damp(
              tower.towerBody.position.y,
              goalY,
              10,
              dt
            );
            animating = true;
          }
          if (Math.abs(tower.ringMesh.scale.x - goalScale) > 0.005) {
            const s = THREE.MathUtils.damp(
              tower.ringMesh.scale.x,
              goalScale,
              10,
              dt
            );
            tower.ringMesh.scale.set(s, s, 1);
            animating = true;
          }
        });

        // Smooth camera preset transition
        if (cameraTransitionActive) {
          if (isSoftwareGl) {
            camera.position.copy(_targetCamPos);
            controls.target.copy(_targetCtrlPos);
            cameraTransitionActive = false;
          } else {
            camera.position.x = THREE.MathUtils.damp(
              camera.position.x,
              _targetCamPos.x,
              7,
              dt
            );
            camera.position.y = THREE.MathUtils.damp(
              camera.position.y,
              _targetCamPos.y,
              7,
              dt
            );
            camera.position.z = THREE.MathUtils.damp(
              camera.position.z,
              _targetCamPos.z,
              7,
              dt
            );
            controls.target.x = THREE.MathUtils.damp(
              controls.target.x,
              _targetCtrlPos.x,
              7,
              dt
            );
            controls.target.y = THREE.MathUtils.damp(
              controls.target.y,
              _targetCtrlPos.y,
              7,
              dt
            );
            controls.target.z = THREE.MathUtils.damp(
              controls.target.z,
              _targetCtrlPos.z,
              7,
              dt
            );
            if (
              camera.position.distanceToSquared(_targetCamPos) < 0.04 &&
              controls.target.distanceToSquared(_targetCtrlPos) < 0.04
            ) {
              camera.position.copy(_targetCamPos);
              controls.target.copy(_targetCtrlPos);
              cameraTransitionActive = false;
            } else {
              animating = true;
            }
          }
        }

        controls.update();
        return animating;
      }
    );

    sceneActionsRef.current = {
      syncSceneData,
      applyCameraPreset,
      zoomStep,
      setAestheticTheme: (theme: MapAestheticTheme) => {
        if (theme === 'day') {
          scene.background = new THREE.Color(0xe8edf4);
          if (scene.fog) {
            scene.fog.color = new THREE.Color(0xe8edf4);
            (scene.fog as THREE.FogExp2).density = 0.0062;
          }
          hemiLight.color.setHex(0xdbeafe);
          hemiLight.groundColor.setHex(0x94a3b8);
          hemiLight.intensity = 0.72;
          keyLight.color.setHex(0xfff7ed);
          keyLight.intensity = 1.55;
          rimLight.color.setHex(0xe0f2fe);
          rimLight.intensity = 0.55;
          evHeadlight.intensity = 0;
        } else if (theme === 'sunset') {
          scene.background = new THREE.Color(0x311b47);
          if (scene.fog) {
            scene.fog.color = new THREE.Color(0x311b47);
            (scene.fog as THREE.FogExp2).density = 0.0075;
          }
          hemiLight.color.setHex(0xfb923c);
          hemiLight.groundColor.setHex(0x3b0764);
          hemiLight.intensity = 0.9;
          keyLight.color.setHex(0xf97316);
          keyLight.intensity = 2.4;
          rimLight.color.setHex(0xa855f7);
          rimLight.intensity = 1.25;
          evHeadlight.color.setHex(0xfef08a);
          evHeadlight.intensity = 3.6;
        } else if (theme === 'cyber') {
          scene.background = new THREE.Color(0x090d16);
          if (scene.fog) {
            scene.fog.color = new THREE.Color(0x090d16);
            (scene.fog as THREE.FogExp2).density = 0.0092;
          }
          hemiLight.color.setHex(0x06b6d4);
          hemiLight.groundColor.setHex(0x022c22);
          hemiLight.intensity = 0.65;
          keyLight.color.setHex(0x10b981);
          keyLight.intensity = 1.45;
          rimLight.color.setHex(0x38bdf8);
          rimLight.intensity = 2.1;
          evHeadlight.color.setHex(0x38bdf8);
          evHeadlight.intensity = 4.0;
        }
        scheduler.requestRender();
      },
      setControlInput,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    syncSceneData(false);

    // Cancel camera preset transitions whenever user starts manual orbit/zoom
    const onControlStart = () => {
      cameraTransitionActive = false;
    };
    const onControlChange = () => {
      scheduler.requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    // Raycasting: Layer 1 for station towers, Ground plane for click-road-to-drive
    const raycaster = new THREE.Raycaster();
    const clickRaycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    let lastMoveCheck = 0;
    let pointerDownPos: { x: number; y: number } | null = null;

    const updateRayMouse = (clientX: number, clientY: number): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      _rayMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _rayMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return true;
    };

    const pickStation = (clientX: number, clientY: number): string | null => {
      if (!updateRayMouse(clientX, clientY)) return null;
      raycaster.setFromCamera(_rayMouse, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        return (hits[0].object.userData.chargingPointId as string) || null;
      }
      return null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMoveCheck < 50) return;
      lastMoveCheck = now;
      const picked = pickStation(e.clientX, e.clientY);
      if (picked !== hoveredIdRef.current) {
        hoveredIdRef.current = picked;
        setHoveredId(picked);
        renderer.domElement.style.cursor = picked ? 'pointer' : 'grab';
        scheduler.requestRender();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const distMoved = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      pointerDownPos = null;
      if (distMoved > 6) return; // User dragged to orbit

      const picked = pickStation(e.clientX, e.clientY);
      if (picked) {
        onSelectRef.current(picked);
        return;
      }

      // Clicked ground/road surface -> Drive EV along Munich road network to clicked road spot
      if (updateRayMouse(e.clientX, e.clientY)) {
        clickRaycaster.setFromCamera(_rayMouse, camera);
        if (clickRaycaster.ray.intersectPlane(_groundPlane, _planeHit)) {
          const { waypoints, destinationSnap } = findRoadPath(
            { x: driveState.x, z: driveState.z },
            { x: _planeHit.x, z: _planeHit.z }
          );
          autopilotWaypoints = waypoints;
          destRingMesh.position.set(
            destinationSnap.x,
            destinationSnap.y + 0.08,
            destinationSnap.z
          );
          destRingMesh.visible = true;
          isDrivingActiveRef.current = true;
          setIsDriving(true);
          scheduler.requestRender();
        }
      }
    };

    // Keyboard WASD / Arrow driving listener on window
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          e.preventDefault();
          setControlInput('forward', true);
          break;
        case 'KeyS':
        case 'ArrowDown':
          e.preventDefault();
          setControlInput('backward', true);
          break;
        case 'KeyA':
        case 'ArrowLeft':
          e.preventDefault();
          setControlInput('left', true);
          break;
        case 'KeyD':
        case 'ArrowRight':
          e.preventDefault();
          setControlInput('right', true);
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          setControlInput('forward', false);
          break;
        case 'KeyS':
        case 'ArrowDown':
          setControlInput('backward', false);
          break;
        case 'KeyA':
        case 'ArrowLeft':
          setControlInput('left', false);
          break;
        case 'KeyD':
        case 'ArrowRight':
          setControlInput('right', false);
          break;
      }
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFallback(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      scheduler.requestRender();
    });
    resizeObserver.observe(container);

    return () => {
      sceneActionsRef.current = null;
      Object.values(pulseTimers).forEach((t) => {
        if (t) window.clearTimeout(t);
      });
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );
      scheduler.dispose();
      disposeObjectTree(scene);
      envTex.dispose();
      shadowTexture.dispose();
      gridTextures.map.dispose();
      gridTextures.roughnessMap.dispose();
      renderer.dispose();
    };
  }, []);

  // Re-sync 3D towers, EV position, geofence radius & route arc when React state updates
  useEffect(() => {
    sceneActionsRef.current?.syncSceneData(true);
  }, [points, selectedId, driverLocation, radiusKm]);

  const activePoint =
    points.find((p) => p.id === (hoveredId || selectedId)) ?? null;
  const activeDistKm = activePoint
    ? calculateDistanceKm(driverLocation, activePoint.location)
    : 0;
  const isOutOfGeofence = activePoint ? activeDistKm > PROXIMITY_RADIUS_KM : false;

  const bindDriveButton = (key: 'forward' | 'backward' | 'left' | 'right') => ({
    onPointerDown: () => sceneActionsRef.current?.setControlInput(key, true),
    onPointerUp: () => {
      // If user taps briefly, give a smooth 320ms drive impulse so a click visibly advances the EV
      sceneActionsRef.current?.setControlInput(key, true, 320);
    },
    onPointerLeave: () => sceneActionsRef.current?.setControlInput(key, false),
  });

  if (webglFallback) {
    return (
      <div className="flex h-[320px] sm:h-[400px] flex-col items-center justify-center gap-2 bg-slate-100 p-6 text-center">
        <p className="text-sm font-semibold text-slate-900">
          3D WebGL context unavailable
        </p>
        <p className="text-xs text-slate-600">
          Switch to the 2D Grid button above to browse charging points on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[320px] sm:h-[400px] w-full overflow-hidden bg-[#e8edf4] select-none">
      {/* Isolated WebGL Canvas Container */}
      <div
        ref={mountRef}
        data-testid="citymap-3d-canvas"
        data-selected-id={selectedId ?? ''}
        data-hovered-id={hoveredId ?? ''}
        data-camera-preset={cameraPreset}
        data-ev-x={evTelemetryAttrs.x}
        data-ev-z={evTelemetryAttrs.z}
        data-road-name={currentRoadName}
        data-driving={isDriving ? 'true' : 'false'}
        className="h-full w-full"
        aria-label="Interactive 3D Munich EV charging grid. Click any road to drive there, use WASD or Arrow keys to drive, drag to orbit, or click a station tower to select."
      />

      {/* Top-Left Minimal Station + Road Position Readout (no backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-xs flex-col gap-1.5">
        {activePoint && (
          <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-xs">
            <div className="flex items-center gap-2 text-xs">
              <Navigation className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate font-semibold text-slate-900">
                {activePoint.name}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-600">
              <span>₹{activePoint.pricePerKwh.toFixed(2)}/kWh</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeDistKm} km (~{estimateEtaMinutes(activeDistKm)} min)
              </span>
              {isOutOfGeofence && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans font-semibold text-amber-700">
                    Outside 10 km
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="inline-flex items-center gap-1.5 self-start rounded-md border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs">
          <Car className="h-3 w-3 shrink-0 text-emerald-600" />
          <span className="truncate" data-testid="ev-road-readout">
            {currentRoadName}
          </span>
        </div>
      </div>

      {/* Top-Right Quick Zoom Buttons & Aesthetic Theme Switcher (clean, no backdrop-filter) */}
      <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center gap-1.5">
        <div
          role="group"
          aria-label="3D map lighting atmosphere"
          className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white/95 p-0.5 shadow-xs"
        >
          <button
            type="button"
            onClick={() => {
              setAestheticTheme('day');
              sceneActionsRef.current?.setAestheticTheme('day');
            }}
            title="Day Mode (Munich Sun)"
            aria-pressed={aestheticTheme === 'day'}
            className={`flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold transition-colors ${
              aestheticTheme === 'day'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sun className="h-3 w-3" />
            <span className="hidden sm:inline">Day</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAestheticTheme('sunset');
              sceneActionsRef.current?.setAestheticTheme('sunset');
            }}
            title="Sunset Golden Hour"
            aria-pressed={aestheticTheme === 'sunset'}
            className={`flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold transition-colors ${
              aestheticTheme === 'sunset'
                ? 'bg-amber-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sunset className="h-3 w-3" />
            <span className="hidden sm:inline">Sunset</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAestheticTheme('cyber');
              sceneActionsRef.current?.setAestheticTheme('cyber');
            }}
            title="Night Architectural Mode"
            aria-pressed={aestheticTheme === 'cyber'}
            className={`flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold transition-colors ${
              aestheticTheme === 'cyber'
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Moon className="h-3 w-3" />
            <span className="hidden sm:inline">Night</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => sceneActionsRef.current?.zoomStep(0.82)}
            aria-label="Zoom in 3D map"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => sceneActionsRef.current?.zoomStep(1.22)}
            aria-label="Zoom out 3D map"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCameraPreset('iso');
              sceneActionsRef.current?.applyCameraPreset('iso');
            }}
            aria-label="Reset 3D camera"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Collapsible Unified Bottom Drive + Camera Dock */}
      <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-10 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          aria-expanded={!dockCollapsed}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs hover:bg-slate-50"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show 3D Controls
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Hide 3D Controls
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div
            role="group"
            aria-label="3D drive and camera controls"
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-sm"
          >
            {/* Compact On-Screen EV Road Drive Controls */}
            <div
              role="group"
              aria-label="Drive EV on road"
              className="flex items-center gap-1 border-r border-slate-200 pr-2"
            >
              <button
                type="button"
                aria-label="Steer EV left"
                {...bindDriveButton('left')}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Drive EV forward"
                {...bindDriveButton('forward')}
                className="flex h-7 w-7 items-center justify-center rounded border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Drive EV reverse"
                {...bindDriveButton('backward')}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Steer EV right"
                {...bindDriveButton('right')}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Camera Presets */}
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'iso', label: 'Iso Orbit', icon: Compass },
                  { id: 'top', label: 'Top-Down', icon: Eye },
                  { id: 'driver', label: 'Follow EV', icon: LocateFixed },
                  { id: 'charger', label: 'Focus Charger', icon: Crosshair },
                ] as const
              ).map((preset) => {
                const Icon = preset.icon;
                const isActive = cameraPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setCameraPreset(preset.id);
                      sceneActionsRef.current?.applyCameraPreset(preset.id);
                    }}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <span className="hidden pl-1 text-[11px] text-slate-500 xl:inline">
              Click road or WASD to drive
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
