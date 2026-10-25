import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
  Vector3,
} from 'three';
import {
  DINOSAUR_EYE,
  DINOSAUR_EYE_COLOR,
  DINOSAUR_EYE_HIGHLIGHT,
  DINOSAUR_MARK_COLOR,
  dinosaurSpineMarks,
} from '../origami/recipes/dinosaur.recipe.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';

function mat(color: string, offset = -2): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.72,
    metalness: 0,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}

function spineMarks(): Group {
  const group = new Group();
  group.name = 'dinosaur-spine';
  const material = mat(DINOSAUR_MARK_COLOR, -3);
  for (const mark of dinosaurSpineMarks()) {
    const positions = mark.points.flatMap((point) => [point[0], point[1], point[2]]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  return group;
}

function eye(): Group {
  const group = new Group();
  group.name = 'dinosaur-eye';
  const ball = new Mesh(new SphereGeometry(0.0042, 18, 14), mat(DINOSAUR_EYE_COLOR, -4));
  const pupil = new Mesh(new SphereGeometry(0.0018, 12, 10), mat('#0c0b09', -4));
  pupil.position.z = 0.0032;
  const highlight = new Mesh(new SphereGeometry(0.001, 8, 8), mat(DINOSAUR_EYE_HIGHLIGHT, -5));
  highlight.position.set(0.0012, 0.0013, 0.0042);
  group.add(ball, pupil, highlight);
  group.position.set(DINOSAUR_EYE[0], DINOSAUR_EYE[1], DINOSAUR_EYE[2]);
  return group;
}

export class DinosaurCreature {
  readonly group = new Group();
  private readonly features = new Group();
  private readonly spine: Group;
  private readonly eyeGroup: Group;
  private elapsed = 0;
  private playing = false;
  private reveal = 0;
  private held = false;

  constructor() {
    this.group.name = 'fold-play-dinosaur';
    this.group.visible = false;
    this.spine = spineMarks();
    this.eyeGroup = eye();
    this.features.name = 'dinosaur-features';
    this.features.visible = false;
    this.features.add(this.spine, this.eyeGroup);
    this.group.add(this.features);
  }

  start(from: Vector3, puppet?: Object3D): void {
    this.elapsed = 0;
    this.playing = true;
    this.reveal = 1;
    this.applyReveal();
    if (puppet) {
      this.group.visible = false;
      this.present(puppet, true);
    } else {
      this.group.position.copy(from);
      this.group.visible = true;
      this.features.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'dinosaur' });
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
    this.eyeGroup.rotation.set(0, 0, 0);
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
    if (!this.playing || this.held) {
      return;
    }
    this.elapsed += dtSec;
    this.eyeGroup.rotation.z = Math.sin(this.elapsed * 1.35) * 0.22;
  }

  private applyReveal(): void {
    const shown = this.reveal;
    const eyePop = 0.15 + 0.85 * (1 - (1 - Math.min(1, shown / 0.4)) ** 3);
    const spinePop = Math.min(1, Math.max(0, (shown - 0.18) / 0.55));
    this.eyeGroup.scale.setScalar(eyePop);
    this.spine.scale.setScalar(0.2 + 0.8 * spinePop);
    this.features.visible = shown > 0.02;
  }
}
