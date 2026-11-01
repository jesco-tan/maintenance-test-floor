import * as THREE from 'three';
import type { State } from '../replay/state';
import { denied } from '../replay/metrics';

export const colors = { 'not started': 0x788792, operating: 0x18786c, replaced: 0x2457c5, failed: 0xb43c43 };
export function labelTexture(width = 512, height = 128) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas labels are unavailable');
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, context, texture };
}

export function createFleet(ids: number[]) {
  const root = new THREE.Group();
  const housing = new THREE.CylinderGeometry(0.57, 0.66, 1.65, 32, 1, true);
  housing.rotateX(Math.PI / 2);
  const ring = new THREE.TorusGeometry(0.62, 0.07, 8, 40);
  const disk = new THREE.CylinderGeometry(0.49, 0.49, 0.08, 32); disk.rotateX(Math.PI / 2);
  const blade = new THREE.BoxGeometry(0.08, 0.42, 0.055);
  const metal = new THREE.MeshStandardMaterial({ color: 0x566874, metalness: 0.75, roughness: 0.32, side: THREE.DoubleSide });
  const edge = new THREE.MeshStandardMaterial({ color: 0xaebbc3, metalness: 0.8, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2b35, metalness: 0.55, roughness: 0.55 });
  const deck = new THREE.BoxGeometry(2.15, 0.18, 2.7);
  const support = new THREE.BoxGeometry(0.14, 0.6, 1.35);
  const hub = new THREE.SphereGeometry(0.15, 16, 12);
  const nodes = ids.map((id, index) => {
    const group = new THREE.Group(); group.position.set((index - (ids.length - 1) / 2) * 3.15, 0, 0.3);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.engineId = id; group.add(mesh); return mesh;
    };
    const padMaterial = new THREE.MeshStandardMaterial({ color: 0xcbd5db, roughness: 0.9 });
    add(deck, padMaterial, 0, 0.1, 0);
    add(support, dark, -0.4, 0.5, 0); add(support, dark, 0.4, 0.5, 0);
    add(housing, metal, 0, 0.95, 0);
    add(ring, edge, 0, 0.95, 0.84); add(ring, edge, 0, 0.95, -0.84);
    add(disk, dark, 0, 0.95, 0.72);
    for (let n = 0; n < 12; n++) {
      const a = n / 12 * Math.PI * 2;
      const mesh = add(blade, edge, Math.sin(a) * 0.27, 0.95 + Math.cos(a) * 0.27, 0.79);
      mesh.rotation.z = -a + 0.35;
    }
    const nose = add(hub, edge, 0, 0.95, 0.85); nose.scale.z = 1.7;
    const lightMaterial = new THREE.MeshStandardMaterial({ color: colors.operating, emissive: colors.operating, emissiveIntensity: 0.3 });
    const light = add(new THREE.BoxGeometry(0.55, 0.065, 0.08), lightMaterial, 0, 0.23, 1.34);
    const selection = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.02, 48), new THREE.MeshBasicMaterial({ color: 0x2457c5, side: THREE.DoubleSide }));
    selection.rotation.x = -Math.PI / 2; selection.position.y = 0.205; group.add(selection);
    const label = labelTexture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.texture, depthTest: false }));
    sprite.scale.set(2.6, 0.65, 1); sprite.position.set(0, 2.05, 0); group.add(sprite);
    root.add(group);
    return { id, group, light, lightMaterial, padMaterial, selection, label };
  });
  function update(state: State, selected: number) {
    nodes.forEach(node => {
      const engine = state.engines.find(e => e.id === node.id)!;
      const annotation = engine.current && denied(engine.current) ? 'Denied' : engine.current?.requested ? 'Allocated' : '';
      const color = engine.current && denied(engine.current) && engine.status !== 'failed' ? 0xa65d05 : colors[engine.status];
      node.lightMaterial.color.setHex(color); node.lightMaterial.emissive.setHex(color);
      node.selection.visible = selected === node.id;
      node.padMaterial.color.setHex(selected === node.id ? 0xc4d5ee : 0xcbd5db);
      const { context: c, canvas, texture } = node.label;
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = '#eef2f4'; c.fillRect(28, 4, 456, 116);
      c.textAlign = 'center'; c.fillStyle = '#263746'; c.font = '600 35px "IBM Plex Sans", sans-serif';
      c.fillText(`Engine ${node.id}`, 256, 48);
      c.font = '26px "IBM Plex Sans", sans-serif'; c.fillText(`${engine.status}${annotation ? ' / ' + annotation : ''}`, 256, 92);
      texture.needsUpdate = true;
    });
  }
  return { root, nodes, update };
}
