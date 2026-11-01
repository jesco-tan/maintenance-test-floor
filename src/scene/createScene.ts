import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFleet, labelTexture } from './fleet';
import type { State } from '../replay/state';
import type { Replay } from '../data/schema';

export function createScene(host: HTMLElement, replay: Replay, select: (id: number) => void, fallback: (message: string) => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(0xe4eaee);
  renderer.shadowMap.enabled = !matchMedia('(max-width: 700px)').matches;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Illustrative engine test floor. Use the fleet table below to select engines with a keyboard.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.touchAction = 'pan-y';
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; controls.enablePan = false;
  controls.minDistance = 10; controls.maxDistance = 23;
  controls.minPolarAngle = 0.32; controls.maxPolarAngle = 1.22;
  controls.minAzimuthAngle = -0.7; controls.maxAzimuthAngle = 0.7;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9baeb9, 2.5));
  const sun = new THREE.DirectionalLight(0xfff6e6, 3.5); sun.position.set(-5, 10, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7; sun.shadow.normalBias = 0.04; scene.add(sun);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.15, 8.5), new THREE.MeshStandardMaterial({ color: 0xd7e0e5, roughness: 0.95 }));
  floor.position.y = -0.1; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(12, 24, 0xb3c2cc, 0xc5d1d8); grid.position.y = -0.015; scene.add(grid);
  const fleet = createFleet(replay.engines.map(e => e.id)); scene.add(fleet.root);
  const board = labelTexture(1024, 300);
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 2.35, 0.14), [
    ...Array.from({ length: 4 }, () => new THREE.MeshStandardMaterial({ color: 0x263746 })),
    new THREE.MeshBasicMaterial({ map: board.texture }), new THREE.MeshStandardMaterial({ color: 0x263746 })]);
  boardMesh.position.set(0, 2.6, -2.95); scene.add(boardMesh);
  const postGeometry = new THREE.BoxGeometry(0.1, 2, 0.1);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x6f828f, metalness: 0.7, roughness: 0.4 });
  for (const x of [-3.5, 3.5]) { const p = new THREE.Mesh(postGeometry, postMaterial); p.position.set(x, 0.9, -2.95); scene.add(p); }
  let frame = 0; let disposed = false; let lost = false; let transitionStart = 0;
  const draw = (now: number) => {
    frame = 0;
    if (disposed || lost) return;
    if (transitionStart) {
      const progress = Math.min(1, (now - transitionStart) / 280);
      fleet.nodes.forEach(node => { node.lightMaterial.emissiveIntensity = 0.3 + Math.sin(progress * Math.PI) * 0.6; });
      if (progress >= 1) transitionStart = 0;
    }
    renderer.render(scene, camera);
    if (transitionStart) invalidate();
  };
  const invalidate = () => { if (!frame && !disposed && !lost) frame = requestAnimationFrame(draw); };
  controls.addEventListener('change', invalidate);
  const reset = () => { camera.position.set(6, 8.5, 16); controls.target.set(0, 0.8, -0.2); controls.update(); invalidate(); };
  reset();
  const observer = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || disposed) return;
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); invalidate();
  }); observer.observe(host);
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
  let down = { x: 0, y: 0 };
  const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const pointerUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(fleet.root, true).find(h => h.object.userData.engineId !== undefined);
    if (hit) select(hit.object.userData.engineId);
  };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; fallback('The 3D view lost its graphics context. Continue with the fleet table and replay controls. Reload to restore the floor.'); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  return {
    reset,
    update(state: State, selected: number, animate = false) {
      transitionStart = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches && state.events.some(e => e.requested || e.consequence !== 'operating') ? performance.now() : 0;
      fleet.nodes.forEach(node => { node.lightMaterial.emissiveIntensity = 0.3; });
      fleet.update(state, selected);
      const c = board.context;
      c.fillStyle = '#263746'; c.fillRect(0, 0, 1024, 300);
      c.textAlign = 'left'; c.fillStyle = '#dce7ed'; c.font = '30px "IBM Plex Sans", sans-serif';
      c.fillText(`Period ${state.period} / Service allocation`, 45, 57);
      const requests = state.events.filter(e => e.requested);
      const allocated = requests.filter(e => e.chosenAction === 'replace');
      c.font = '600 46px "IBM Plex Sans", sans-serif'; c.fillStyle = '#ffffff';
      c.fillText(`${allocated.length} of ${replay.scenario.slotsPerCycle} slots used`, 45, 120);
      c.font = '30px "IBM Plex Sans", sans-serif'; c.fillStyle = '#c7d5dd';
      c.fillText(requests.length ? requests.map(e => `E${e.engineId}: ${e.chosenAction === 'replace' ? 'allocated' : 'denied'}`).join('   /   ') : 'No requests this period', 45, 185);
      c.font = '25px "IBM Plex Sans", sans-serif'; c.fillText('Allocations clear each period. Engine lives never restart.', 45, 258);
      board.texture.needsUpdate = true; invalidate();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
      scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        if (o instanceof THREE.Mesh) geometries.add(o.geometry);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { materials.add(m); const map = (m as THREE.MeshBasicMaterial).map; if (map) textures.add(map); });
      } });
      geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
      sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
