export interface ValidationIssue {
  code:
    | "EDGE_NODE_REF_INVALID"
    | "EDGE_DEGENERATE"
    | "EDGE_FLOOR_LEVEL_MISMATCH"
    | "OPENING_HOST_INVALID"
    | "ROOM_FACE_REF_INVALID"
    | "FACE_POLYGON_INVALID";
  message: string;
  severity: "error" | "warning";
  entityId?: string;
}

export class InvariantViolationError extends Error {
  public readonly details: ValidationIssue[];

  public constructor(message: string, details: ValidationIssue[]) {
    super(message);
    this.name = "InvariantViolationError";
    this.details = details;
  }
}
