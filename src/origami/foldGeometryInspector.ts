export const FOLD_GEOMETRY_INSPECTOR = {
  frontLayer: false,
  backLayer: false,
  foldGroup: false,
  hingeAxis: true,
  layerCount: true,
  layerOwnership: true,
  leftEarCrease: true,
  rightEarCrease: true,
  leftFoldRegion: true,
  rightFoldRegion: true,
};

export const FOLD_GEOMETRY_INSPECTOR_DEFAULTS = { ...FOLD_GEOMETRY_INSPECTOR };

export function resetFoldGeometryInspector(): void {
  Object.assign(FOLD_GEOMETRY_INSPECTOR, FOLD_GEOMETRY_INSPECTOR_DEFAULTS);
}
