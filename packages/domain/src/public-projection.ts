import {
  attestationStatusAt,
  type AttestationStatusInput,
  type CanonicalAttestationStatus,
} from "./attestation.js";

export interface InternalAttestationProjectionSource extends AttestationStatusInput {
  readonly opaqueReference: string;
  readonly issuerReference: string;
  readonly attestationType: "human_presence";
  readonly policyVersionReferences: readonly string[];
}

export interface PublicAttestationProjection {
  readonly opaqueReference: string;
  readonly status: CanonicalAttestationStatus;
  readonly attestationType: "human_presence";
  readonly issuerReference: string;
  readonly validFrom: string;
  readonly expiresAt: string;
  readonly policyVersionReferences: readonly string[];
}

export function projectPublicAttestation(
  source: InternalAttestationProjectionSource,
  now: Date,
): PublicAttestationProjection {
  return Object.freeze({
    opaqueReference: source.opaqueReference,
    status: attestationStatusAt(source, now),
    attestationType: source.attestationType,
    issuerReference: source.issuerReference,
    validFrom: source.validFrom.toISOString(),
    expiresAt: source.expiresAt.toISOString(),
    policyVersionReferences: Object.freeze([...source.policyVersionReferences]),
  });
}
