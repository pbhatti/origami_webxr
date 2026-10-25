import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import {
  LADYBUG_EYES,
  LADYBUG_FEATURE_Z,
  LADYBUG_MARK_COLOR,
  LADYBUG_SEAM,
  LADYBUG_SPOTS,
} from '../origami/recipes/ladybug.recipe.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';

function mat(color: string, opacity = 1, offset = -3): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.7,
    metalness: 0,
    side: DoubleSide,
    transparent: opacity < 1,
    opacity,
    depthTest: true,
    depthWrite: opacity >= 1,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}

function mark(radius: number): Mesh {
  const mesh = new Mesh(new CircleGeometry(radius, 22), mat(LADYBUG_MARK_COLOR, 1, -4));
  mesh.position.z = LADYBUG_FEATURE_Z;
  mesh.renderOrder = 3;
  return mesh;
}

function eyes(): Group {
  const group = new Group();
  group.name = 'ladybug-eyes';
  for (const eye of LADYBUG_EYES) {
    const mesh = mark(eye.radius);
    mesh.position.set(eye.at[0], eye.at[1], LADYBUG_FEATURE_Z);
    group.add(mesh);
  }
  return group;
}

function spots(): Group {
  const group = new Group();
  group.name = 'ladybug-spots';
  for (const spot of LADYBUG_SPOTS) {
    const mesh = mark(spot.radius);
    mesh.position.set(spot.at[0], spot.at[1], LADYBUG_FEATURE_Z);
    group.add(mesh);
  }
  return group;
}

function seam(): Mesh {
  const { from, to, width } = LADYBUG_SEAM;
  const half = width / 2;
  const positions = [
    from[0] - half, from[1], LADYBUG_FEATURE_Z,
    from[0] + half, from[1], LADYBUG_FEATURE_Z,
    to[0] + half, to[1], LADYBUG_FEATURE_Z,
    from[0] - half, from[1], LADYBUG_FEATURE_Z,
    to[0] + half, to[1], LADYBUG_FEATURE_Z,
    to[0] - half, to[1], LADYBUG_FEATURE_Z,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, mat(LADYBUG_MARK_COLOR, 0.4, -2));
  mesh.name = 'ladybug-seam';
  mesh.renderOrder = 2;
  return mesh;
}

export class LadybugCreature {
  readonly group = new Group();
  private readonly features = new Group();
  private readonly eyeGroup: Group;
  private readonly spotGroup: Group;
  private elapsed = 0;
  private playing = false;
  private reveal = 0;
  private held = false;
  private puppet: Object3D | null = null;

  constructor() {
    this.group.name = 'fold-play-ladybug';
    this.group.visible = false;
    this.eyeGroup = eyes();
    this.spotGroup = spots();
    this.features.name = 'ladybug-features';
    this.features.visible = false;
    this.features.add(this.eyeGroup, this.spotGroup, seam());
    this.group.add(this.features);
  }

  start(from: Vector3, puppet?: Object3D): void {
    this.elapsed = 0;
    this.playing = true;
    this.reveal = 1;
    this.applyReveal();
    this.puppet = puppet ?? null;
    if (puppet) {
      this.group.visible = false;
      this.present(puppet, true);
    } else {
      this.group.position.copy(from);
      this.group.visible = true;
      this.features.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'ladybug' });
  }

  stop(): void {
    this.playing = false;
    this.reveal = 0;
    this.elapsed = 0;
    this.group.visible = false;
    this.features.visible = false;
    this.features.removeFromParent();
    this.group.add(this.features);
    this.features.position.set(0, 0, 0);
    this.features.rotation.set(0, 0, 0);
    if (this.puppet) {
      this.puppet.rotation.set(0, 0, 0);
    }
    this.puppet = null;
    this.held = false;
  }

  get active(): boolean {
    return this.playing;
  }

  setHeld(held: boolean): void {
    this.held = held;
  }

  setReveal(amount: number): void {
    this.reveal = Math.min(1, Math.max(0, amount));
    this.applyReveal();
  }

  present(host: Object3D, visible: boolean): void {
    if (!visible) {
      if (!this.playing) {
        this.features.visible = false;
      }
      return;
    }
    if (this.features.parent !== host) {
      this.features.removeFromParent();
      host.add(this.features);
    }
    this.features.visible = this.reveal > 0.02;
  }

  tick(dtSec: number): void {
    if (!this.playing || this.held || !this.puppet) {
      return;
    }
    this.elapsed += dtSec;
    this.puppet.rotation.z = Math.sin(this.elapsed * 0.9) * 0.035;
    this.puppet.rotation.x = Math.sin(this.elapsed * 7.5) * 0.012;
  }

  private applyReveal(): void {
    const shown = this.reveal;
    const eyePop = 0.15 + 0.85 * (1 - (1 - Math.min(1, shown / 0.35)) ** 3);
    const spotPop = Math.min(1, Math.max(0, (shown - 0.18) / 0.55));
    this.eyeGroup.scale.setScalar(eyePop);
    this.spotGroup.scale.setScalar(0.2 + 0.8 * spotPop);
    this.features.visible = shown > 0.02;
  }
}
