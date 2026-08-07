export const MAX_ATTESTATION_VALIDITY_DAYS = 45 as const;
export const MAX_ATTESTATION_VALIDITY_MS = MAX_ATTESTATION_VALIDITY_DAYS * 24 * 60 * 60 * 1_000;

export class InvalidAttestationValidityError extends Error {
  readonly code = "INVALID_ATTESTATION_VALIDITY" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidAttestationValidityError";
  }
}

export interface AttestationValidity {
  readonly version: number;
  readonly validFrom: Date;
  readonly expiresAt: Date;
  readonly supersedesReference?: string;
}

export function createAttestationValidity(input: AttestationValidity): AttestationValidity {
  const validFromMs = input.validFrom.getTime();
  const expiresAtMs = input.expiresAt.getTime();

  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new InvalidAttestationValidityError("attestation version must be a positive integer");
  }
  if (!Number.isFinite(validFromMs) || !Number.isFinite(expiresAtMs)) {
    throw new InvalidAttestationValidityError("attestation validity requires finite timestamps");
  }
  if (expiresAtMs <= validFromMs) {
    throw new InvalidAttestationValidityError("attestation expiry must follow its validity start");
  }
  if (expiresAtMs - validFromMs > MAX_ATTESTATION_VALIDITY_MS) {
    throw new InvalidAttestationValidityError(
      `attestation validity cannot exceed ${MAX_ATTESTATION_VALIDITY_DAYS} days`,
    );
  }
  if (input.version > 1 && !input.supersedesReference) {
    throw new InvalidAttestationValidityError(
      "a renewed attestation version must reference the attestation it supersedes",
    );
  }

  return Object.freeze({
    version: input.version,
    validFrom: new Date(validFromMs),
    expiresAt: new Date(expiresAtMs),
    ...(input.supersedesReference ? { supersedesReference: input.supersedesReference } : undefined),
  });
}

export type CanonicalAttestationStatus =
  "active" | "expired" | "revoked" | "superseded" | "unavailable";

export interface AttestationStatusInput extends AttestationValidity {
  readonly issuanceComplete: boolean;
  readonly revokedAt?: Date;
  readonly supersededAt?: Date;
}

export function attestationStatusAt(
  input: AttestationStatusInput,
  now: Date,
): CanonicalAttestationStatus {
  createAttestationValidity(input);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new InvalidAttestationValidityError("status clock must be a finite timestamp");
  }
  if (!input.issuanceComplete || nowMs < input.validFrom.getTime()) {
    return "unavailable";
  }
  if (input.revokedAt && input.revokedAt.getTime() <= nowMs) {
    return "revoked";
  }
  if (input.supersededAt && input.supersededAt.getTime() <= nowMs) {
    return "superseded";
  }
  return nowMs >= input.expiresAt.getTime() ? "expired" : "active";
}
