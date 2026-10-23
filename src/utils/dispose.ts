import type { Material, Object3D } from 'three';

function disposeMaterial(material: Material): void {
  material.dispose();
}

export function disposeObject3D(object: Object3D): void {
  object.traverse((child) => {
    const mesh = child as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMaterial);
    } else if (mesh.material) {
      disposeMaterial(mesh.material);
    }
  });
}
