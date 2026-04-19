import { describe, expect, it } from "vitest";
import { createDefaultProjectData } from "../../core/model/defaults";
import { validateInvariants } from "../../core/validation/invariants";

describe("validateProjectInvariants", () => {
  it("returns no errors for default project", () => {
    const errors = validateInvariants(createDefaultProjectData());
    expect(errors).toHaveLength(0);
  });
});
