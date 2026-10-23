import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { CREASE_GUIDE } from '../origami/foldAssist.ts';
import type { Vec3 } from '../origami/types.ts';

function addQuad(positions: number[], a: Vector3, b: Vector3, normal: Vector3, halfWidth: number): void {
  const left = normal.clone().multiplyScalar(-halfWidth);
  const right = normal.clone().multiplyScalar(halfWidth);
  const aL = a.clone().add(left);
  const aR = a.clone().add(right);
  const bL = b.clone().add(left);
  const bR = b.clone().add(right);
  positions.push(aL.x, aL.y, aL.z, aR.x, aR.y, aR.z, bR.x, bR.y, bR.z);
  positions.push(aL.x, aL.y, aL.z, bR.x, bR.y, bR.z, bL.x, bL.y, bL.z);
}

function widthNormal(dir: Vector3): Vector3 {
  const normal = new Vector3(-dir.y, dir.x, 0);
  if (normal.lengthSq() < 1e-10) {
    normal.set(1, 0, 0);
  }
  return normal.normalize();
}

export function dashedRibbonGeometry(
  points: Vec3[],
  widthM = CREASE_GUIDE.widthM,
  dashM = CREASE_GUIDE.dashM,
  gapM = CREASE_GUIDE.gapM,
  liftM = CREASE_GUIDE.liftM,
): BufferGeometry {
  const positions: number[] = [];
  const half = widthM / 2;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (!from || !to) {
      continue;
    }
    const start = new Vector3(from[0], from[1], from[2] + liftM);
    const end = new Vector3(to[0], to[1], to[2] + liftM);
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length < 1e-6) {
      continue;
    }
    const dir = delta.clone().multiplyScalar(1 / length);
    const normal = widthNormal(dir);
    let traveled = 0;
    while (traveled < length) {
      const dashEnd = Math.min(traveled + dashM, length);
      const a = start.clone().addScaledVector(dir, traveled);
      const b = start.clone().addScaledVector(dir, dashEnd);
      addQuad(positions, a, b, normal, half);
      traveled += dashM + gapM;
    }
  }
  if (positions.length === 0) {
    addQuad(positions, new Vector3(0, 0, liftM), new Vector3(0, 0.001, liftM), new Vector3(1, 0, 0), half);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function dashedRibbonMesh(
  points: Vec3[],
  color: string,
  opacity = 1,
  widthM = CREASE_GUIDE.widthM,
  dashM = CREASE_GUIDE.dashM,
  gapM = CREASE_GUIDE.gapM,
): Mesh {
  const mesh = new Mesh(
    dashedRibbonGeometry(points, widthM, dashM, gapM),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.renderOrder = 7;
  mesh.frustumCulled = false;
  return mesh;
}

export function setRibbonPoints(
  mesh: Mesh,
  points: Vec3[],
  widthM = CREASE_GUIDE.widthM,
  dashM = CREASE_GUIDE.dashM,
  gapM = CREASE_GUIDE.gapM,
): void {
  mesh.geometry.dispose();
  mesh.geometry = dashedRibbonGeometry(points, widthM, dashM, gapM);
}

export function pointOnPolyline(points: Vec3[], t: number): { position: Vector3; tangent: Vector3 } {
  const clamped = Math.min(Math.max(t, 0), 1);
  const segments: Array<{ from: Vector3; to: Vector3; length: number }> = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const fromRaw = points[i];
    const toRaw = points[i + 1];
    if (!fromRaw || !toRaw) {
      continue;
    }
    const from = new Vector3(...fromRaw);
    const to = new Vector3(...toRaw);
    const length = from.distanceTo(to);
    segments.push({ from, to, length });
    total += length;
  }
  if (segments.length === 0 || total < 1e-8) {
    const fallback = points[0] ?? [0, 0, 0];
    return { position: new Vector3(...fallback), tangent: new Vector3(0, 1, 0) };
  }
  let remaining = clamped * total;
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments.at(-1)) {
      const u = segment.length < 1e-8 ? 0 : Math.min(remaining / segment.length, 1);
      const tangent = segment.to.clone().sub(segment.from);
      if (tangent.lengthSq() < 1e-10) {
        tangent.set(0, 1, 0);
      } else {
        tangent.normalize();
      }
      return {
        position: segment.from.clone().lerp(segment.to, u),
        tangent,
      };
    }
    remaining -= segment.length;
  }
  const last = segments.at(-1)!;
  return {
    position: last.to.clone(),
    tangent: last.to.clone().sub(last.from).normalize(),
  };
}
