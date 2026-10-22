import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from './creaseMath.ts';
import { interpolatesMesh, type FoldStep, type OrigamiRecipe, type Vec3 } from './types.ts';

export interface RecipeIssue {
  path: string;
  message: string;
}

function finiteVec3(value: Vec3 | undefined, path: string, issues: RecipeIssue[]): void {
  if (!value || value.length !== 3 || value.some((n) => !Number.isFinite(n))) {
    issues.push({ path, message: 'expected a finite Vec3' });
  }
}

function validateStep(step: FoldStep, recipe: OrigamiRecipe, issues: RecipeIssue[]): void {
  const prefix = `steps[${step.id}]`;
  if (!step.id) {
    issues.push({ path: prefix, message: 'step id is required' });
  }
  const fromSnap = recipe.snapshots[step.fromSnapshotId];
  const toSnap = recipe.snapshots[step.toSnapshotId];
  if (!fromSnap) {
    issues.push({ path: `${prefix}.fromSnapshotId`, message: `missing snapshot ${step.fromSnapshotId}` });
  }
  if (!toSnap) {
    issues.push({ path: `${prefix}.toSnapshotId`, message: `missing snapshot ${step.toSnapshotId}` });
  }
  if (interpolatesMesh(step) && fromSnap && toSnap && fromSnap.vertices.length !== toSnap.vertices.length) {
    issues.push({
      path: `${prefix}.meshStrategy`,
      message: 'interpolation snapshots must have the same vertex count',
    });
  }
  finiteVec3(step.hinge.p0, `${prefix}.hinge.p0`, issues);
  finiteVec3(step.hinge.p1, `${prefix}.hinge.p1`, issues);
  finiteVec3(step.creaseLineLocal[0], `${prefix}.creaseLineLocal[0]`, issues);
  finiteVec3(step.creaseLineLocal[1], `${prefix}.creaseLineLocal[1]`, issues);
  const alignmentM = creaseAlignmentErrorM(step);
  if (alignmentM > CREASE_ALIGN_TOL_M) {
    issues.push({
      path: `${prefix}.creaseLineLocal`,
      message: `visual crease diverges from hinge by ${(alignmentM * 1000).toFixed(2)}mm`,
    });
  }
  if (
    step.hinge.p0[0] === step.hinge.p1[0] &&
    step.hinge.p0[1] === step.hinge.p1[1] &&
    step.hinge.p0[2] === step.hinge.p1[2]
  ) {
    issues.push({ path: `${prefix}.hinge`, message: 'hinge endpoints must differ' });
  }
  for (const [index, hinge] of (step.coupledHinges ?? []).entries()) {
    finiteVec3(hinge.p0, `${prefix}.coupledHinges[${index}].p0`, issues);
    finiteVec3(hinge.p1, `${prefix}.coupledHinges[${index}].p1`, issues);
    if (
      hinge.p0[0] === hinge.p1[0] &&
      hinge.p0[1] === hinge.p1[1] &&
      hinge.p0[2] === hinge.p1[2]
    ) {
      issues.push({ path: `${prefix}.coupledHinges[${index}]`, message: 'hinge endpoints must differ' });
    }
  }
  if (step.movingRegion.polygonUV.length < 3) {
    issues.push({ path: `${prefix}.movingRegion`, message: 'grab polygon needs 3+ points' });
  }
  if (!(step.minAngleDeg <= step.startAngleDeg && step.startAngleDeg <= step.maxAngleDeg)) {
    issues.push({ path: `${prefix}.startAngleDeg`, message: 'start angle outside min/max' });
  }
  if (step.targetAngleDeg < step.minAngleDeg || step.targetAngleDeg > step.maxAngleDeg) {
    issues.push({ path: `${prefix}.targetAngleDeg`, message: 'target angle outside min/max' });
  }
  if (!Number.isFinite(step.angleToleranceDeg) || step.angleToleranceDeg <= 0) {
    issues.push({ path: `${prefix}.angleToleranceDeg`, message: 'tolerance must be a positive finite number' });
  }
  for (const landmark of step.targetLandmarks) {
    finiteVec3(landmark.target, `${prefix}.landmarks.${landmark.sourceVertexId}`, issues);
  }
  const creaseIds = new Set((recipe.creases ?? []).map((crease) => crease.id));
  for (const id of step.lockCreaseIds ?? []) {
    if (!creaseIds.has(id)) {
      issues.push({ path: `${prefix}.lockCreaseIds`, message: `unknown crease ${id}` });
    }
  }
}

export function validateRecipe(recipe: OrigamiRecipe): RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  if (!recipe.id) {
    issues.push({ path: 'id', message: 'recipe id is required' });
  }
  if (!Number.isFinite(recipe.sheetSizeM) || recipe.sheetSizeM <= 0) {
    issues.push({ path: 'sheetSizeM', message: 'sheet size must be a positive finite number' });
  }
  if (recipe.steps.length === 0) {
    issues.push({ path: 'steps', message: 'recipe needs at least one step' });
  }
  const creaseIds = new Set<string>();
  for (const crease of recipe.creases ?? []) {
    if (creaseIds.has(crease.id)) {
      issues.push({ path: `creases[${crease.id}]`, message: 'duplicate crease id' });
    }
    creaseIds.add(crease.id);
    finiteVec3(crease.p0, `creases[${crease.id}].p0`, issues);
    finiteVec3(crease.p1, `creases[${crease.id}].p1`, issues);
  }
  for (const [index, point] of (recipe.finalSilhouette ?? []).entries()) {
    finiteVec3(point, `finalSilhouette[${index}]`, issues);
  }
  const ids = new Set<string>();
  recipe.steps.forEach((step) => {
    if (ids.has(step.id)) {
      issues.push({ path: `steps[${step.id}]`, message: 'duplicate step id' });
    }
    ids.add(step.id);
    validateStep(step, recipe, issues);
  });
  return issues;
}

export function assertRecipe(recipe: OrigamiRecipe): void {
  const issues = validateRecipe(recipe);
  if (issues.length > 0) {
    throw new Error(`Invalid recipe ${recipe.id}: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
  }
}
