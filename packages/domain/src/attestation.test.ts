import { describe, expect, it } from "vitest";

import {
  attestationStatusAt,
  createAttestationValidity,
  InvalidAttestationValidityError,
  MAX_ATTESTATION_VALIDITY_MS,
  projectPublicAttestation,
  requireEligibleReviewer,
  type ReviewerIneligibleError,
} from "./index.js";

const validFrom = new Date("2030-01-01T00:00:00.000Z");
const expiresAt = new Date(validFrom.getTime() + MAX_ATTESTATION_VALIDITY_MS);

describe("exact attestation validity", () => {
  it("accepts exactly 45 days and expires at the exact boundary", () => {
    const validity = createAttestationValidity({ version: 1, validFrom, expiresAt });
    const status = { ...validity, issuanceComplete: true };

    expect(attestationStatusAt(status, new Date(expiresAt.getTime() - 1))).toBe("active");
    expect(attestationStatusAt(status, expiresAt)).toBe("expired");
    expect(attestationStatusAt(status, new Date(expiresAt.getTime() + 1))).toBe("expired");
  });

  it("rejects validity beyond 45 days and renewal without a predecessor", () => {
    expect(() =>
      createAttestationValidity({
        version: 1,
        validFrom,
        expiresAt: new Date(expiresAt.getTime() + 1),
      }),
    ).toThrow(InvalidAttestationValidityError);
    expect(() => createAttestationValidity({ version: 2, validFrom, expiresAt })).toThrow(
      InvalidAttestationValidityError,
    );
  });

  it("prioritizes effective revocation and supersession over time status", () => {
    const base = { version: 1, validFrom, expiresAt, issuanceComplete: true };
    const now = new Date("2030-01-02T00:00:00.000Z");
    expect(attestationStatusAt({ ...base, revokedAt: now }, now)).toBe("revoked");
    expect(attestationStatusAt({ ...base, supersededAt: now }, now)).toBe("superseded");
    expect(attestationStatusAt({ ...base, issuanceComplete: false }, now)).toBe("unavailable");
  });
});

describe("review eligibility boundary", () => {
  const eligible = {
    actorReference: "actor_synthetic_reviewer_001",
    actorCommitteeReference: "committee_synthetic_001",
    targetCommitteeReference: "committee_synthetic_001",
    authorized: true,
    conflicted: false,
    policyVersionReference: "policy_synthetic_review_v1",
  } as const;

  it("accepts a policy-versioned external authorization decision", () => {
    expect(requireEligibleReviewer(eligible)).toEqual({
      actorReference: eligible.actorReference,
      committeeReference: eligible.targetCommitteeReference,
      policyVersionReference: eligible.policyVersionReference,
    });
  });

  it.each([
    [{ ...eligible, authorized: false }, "REVIEWER_NOT_AUTHORIZED"],
    [{ ...eligible, conflicted: true }, "REVIEWER_CONFLICTED"],
    [{ ...eligible, actorCommitteeReference: "committee_synthetic_002" }, "CROSS_COMMITTEE_REVIEW"],
  ] as const)("rejects ineligible decisions", (decision, code) => {
    expect(() => requireEligibleReviewer(decision)).toThrowError(
      expect.objectContaining<Partial<ReviewerIneligibleError>>({ code }),
    );
  });
});

describe("public attestation projection", () => {
  it("uses an explicit allowlist and excludes internal fields", () => {
    const projected = projectPublicAttestation(
      {
        version: 1,
        validFrom,
        expiresAt,
        issuanceComplete: true,
        opaqueReference: "attestation_synthetic_public_001",
        issuerReference: "committee_synthetic_001",
        attestationType: "human_presence",
        policyVersionReferences: ["policy_synthetic_v1"],
        participantInternalReference: "must-not-project",
        evidencePathCategory: "must-not-project",
        privateNarrative: "must-not-project",
      } as Parameters<typeof projectPublicAttestation>[0] & Record<string, unknown>,
      new Date("2030-01-02T00:00:00.000Z"),
    );

    expect(projected.status).toBe("active");
    expect(projected).not.toHaveProperty("participantInternalReference");
    expect(projected).not.toHaveProperty("evidencePathCategory");
    expect(projected).not.toHaveProperty("privateNarrative");
  });
});
