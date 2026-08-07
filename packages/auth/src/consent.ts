import { createHash } from "node:crypto";

import { AuthError } from "./errors.js";

export const CONSENT_PURPOSES = [
  "privacy_notice",
  "evidence_non_retention",
  "session_attendance",
  "optional_verus_link",
  "optional_public_identity_proof",
  "relying_party_disclosure",
  "material_policy_change",
  "committee_covenants_training",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentAction = "accepted" | "declined" | "withdrawn";

export const OPTIONAL_CONSENT_PURPOSES: ReadonlySet<ConsentPurpose> = new Set([
  "optional_verus_link",
  "optional_public_identity_proof",
  "relying_party_disclosure",
]);

export interface ConsentPresentation {
  readonly presentationReference: string;
  readonly purpose: ConsentPurpose;
  readonly policyVersionReference: string;
  readonly contentDigest: string;
  readonly presentedAt: Date;
  readonly preselected: boolean;
  readonly bundledPurposes: readonly ConsentPurpose[];
}

export interface ConsentChoice {
  readonly action: Exclude<ConsentAction, "withdrawn">;
  readonly actedAt: Date;
}

export interface VersionedConsentReceipt {
  readonly accountReference: string;
  readonly committeeReference: string | null;
  readonly purpose: ConsentPurpose;
  readonly policyVersionReference: string;
  readonly presentationReference: string;
  readonly presentationDigest: string;
  readonly action: ConsentAction;
  readonly presentedAt: Date;
  readonly actedAt: Date;
}

export interface RequiredPolicy {
  readonly purpose: ConsentPurpose;
  readonly policyVersionReference: string;
  readonly effectiveAt: Date;
  readonly expiresAt: Date | null;
  readonly optional: boolean;
}

function presentationDigest(presentation: ConsentPresentation): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        presentationReference: presentation.presentationReference,
        purpose: presentation.purpose,
        policyVersionReference: presentation.policyVersionReference,
        contentDigest: presentation.contentDigest,
        presentedAt: presentation.presentedAt.toISOString(),
      }),
      "utf8",
    )
    .digest("hex");
}

export function recordConsentChoice(input: {
  readonly accountReference: string;
  readonly committeeReference: string | null;
  readonly presentation: ConsentPresentation;
  readonly choice: ConsentChoice;
}): VersionedConsentReceipt {
  const { presentation, choice } = input;
  if (
    presentation.preselected ||
    presentation.bundledPurposes.length !== 1 ||
    presentation.bundledPurposes[0] !== presentation.purpose ||
    choice.actedAt < presentation.presentedAt ||
    (!OPTIONAL_CONSENT_PURPOSES.has(presentation.purpose) && choice.action === "declined")
  ) {
    throw new AuthError("CONSENT_INVALID");
  }

  return Object.freeze({
    accountReference: input.accountReference,
    committeeReference: input.committeeReference,
    purpose: presentation.purpose,
    policyVersionReference: presentation.policyVersionReference,
    presentationReference: presentation.presentationReference,
    presentationDigest: presentationDigest(presentation),
    action: choice.action,
    presentedAt: presentation.presentedAt,
    actedAt: choice.actedAt,
  });
}

export function requireCurrentPolicyReceipts(input: {
  readonly requirements: readonly RequiredPolicy[];
  readonly receipts: readonly VersionedConsentReceipt[];
  readonly now: Date;
}): void {
  for (const requirement of input.requirements) {
    if (requirement.optional) continue;
    const current =
      requirement.effectiveAt <= input.now &&
      (requirement.expiresAt === null || requirement.expiresAt > input.now);
    const receipt = input.receipts.find(
      (candidate) =>
        candidate.purpose === requirement.purpose &&
        candidate.policyVersionReference === requirement.policyVersionReference &&
        candidate.action === "accepted",
    );
    if (!current || !receipt) throw new AuthError("POLICY_REQUIRED");
  }
}
