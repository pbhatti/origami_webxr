import {
  AdditiveBlending,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { clamp, degToRad } from '../utils/math.ts';
import { PAPER_SIZE_M } from './placement.ts';

function halfPlane(color: string): Mesh {
  return new Mesh(
    new PlaneGeometry(PAPER_SIZE_M / 2, PAPER_SIZE_M),
    new MeshStandardMaterial({
      color: new Color(color),
      roughness: 0.92,
      metalness: 0.02,
      side: DoubleSide,
    }),
  );
}

export function createPaperSheet(): {
  group: Group;
  hinge: Group;
  left: Mesh;
  right: Mesh;
} {
  const group = new Group();
  group.name = 'fold-fly-paper-sheet';

  const left = halfPlane('#e24a1a');
  left.position.x = -PAPER_SIZE_M / 4;
  left.name = 'paper-left';
  const leftBack = halfPlane('#c43d14');
  leftBack.position.set(-PAPER_SIZE_M / 4, 0, -0.0005);
  leftBack.rotateY(Math.PI);

  const hinge = new Group();
  hinge.name = 'fold-hinge';
  const right = halfPlane('#e24a1a');
  right.position.x = PAPER_SIZE_M / 4;
  right.name = 'paper-right';
  const rightBack = halfPlane('#c43d14');
  rightBack.position.set(PAPER_SIZE_M / 4, 0, -0.0005);
  rightBack.rotateY(Math.PI);
  hinge.add(right, rightBack);

  const glow = new Mesh(
    new PlaneGeometry(PAPER_SIZE_M * 1.08, PAPER_SIZE_M * 1.08),
    new MeshBasicMaterial({
      color: new Color('#ff7a3d'),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    }),
  );
  glow.position.z = -0.001;
  glow.name = 'paper-glow';

  const edges = new LineSegments(
    new EdgesGeometry(new PlaneGeometry(PAPER_SIZE_M, PAPER_SIZE_M)),
    new LineBasicMaterial({ color: '#6b2a12' }),
  );
  edges.name = 'paper-edges';

  group.add(glow, left, leftBack, hinge, edges);
  return { group, hinge, left, right };
}

export function applyHingeAngle(hinge: Group, angleDeg: number): void {
  const t = clamp(angleDeg / 180, 0, 1);
  hinge.rotation.y = -degToRad(angleDeg);
  hinge.position.z = 0.0008 * Math.sin(degToRad(angleDeg)) + 0.0007 * t;
  hinge.position.x = -0.00045 * t;
}
