export const EPSILON_CM = 0.0001;
export const EPSILON_LENGTH_CM = 0.001;
export const GEOMETRY_EPSILON_CM = EPSILON_CM;
export const POSITION_EPSILON_CM = 0.001;
export const MIN_EDGE_LENGTH_CM = 1;
export const MIN_FACE_AREA_CM2 = 25;
export const FACE_MIN_AREA_CM2 = MIN_FACE_AREA_CM2;

export const SNAP_RADIUS_CM = 24;
export const SNAP_SWITCH_MIN_DELTA = 0.08;
export const SNAP_LOCK_RELEASE_DISTANCE_CM = 18;
export const TOLERANCES_CM = {
  snapRadius: SNAP_RADIUS_CM,
  snapSwitchMinDelta: SNAP_SWITCH_MIN_DELTA,
  snapLockReleaseDistance: SNAP_LOCK_RELEASE_DISTANCE_CM,
} as const;

export const FACE_RECONCILIATION_MIN_SCORE = 0.45;
