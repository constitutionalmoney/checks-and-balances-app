import { createHash } from "node:crypto";

import { AuthError } from "./errors.js";
import type { AuthenticationStrength } from "./trust-domain.js";

export const AUTHORIZATION_ROLES = [
  "scheduler",
  "reviewer",
  "signer",
  "administrator",
  "privacy",
  "security",
  "support",
  "steward",
  "relying_party",
] as const;
export type AuthorizationRole = (typeof AUTHORIZATION_ROLES)[number];

export const AUTHORIZATION_ACTIONS = [
  "participant.read_own",
  "participant.update_own",
  "participant.appeal",
  "participant.close_account",
  "participant.export_sensitive",
  "participant.link_verus",
  "participant.unlink_verus",
  "participant.publish_public_proof",
  "session.schedule",
  "session.assign",
  "verification.review",
  "verification.approve",
  "attestation.sign",
  "attestation.issue",
  "attestation.revoke",
  "privacy.fulfil_request",
  "security.inspect",
  "security.revoke_sessions",
  "support.recover_account",
  "committee.manage_roles",
  "committee.suspend",
  "client.rotate_key",
  "policy.manage",
  "release.manage",
  "relying_party.read_status",
] as const;
export type AuthorizationAction = (typeof AUTHORIZATION_ACTIONS)[number];

export type AuthorizationDenial =
  | "account_inactive"
  | "action_not_granted"
  | "committee_inactive"
  | "conflict_declared"
  | "cross_committee"
  | "feature_disabled"
  | "four_eyes_required"
  | "membership_inactive"
  | "not_own_resource"
  | "policy_missing_or_expired"
  | "reauthentication_required"
  | "session_not_assigned"
  | "state_precondition_failed"
  | "wrong_trust_domain";

export interface CurrentPolicyGate {
  readonly policyKey: string;
  readonly version: string;
  readonly effectiveAt: Date;
  readonly expiresAt: Date | null;
  readonly acknowledgedVersion: string | null;
}

export interface FourEyesApproval {
  readonly approverReference: string;
  readonly approverRoles: readonly AuthorizationRole[];
  readonly active: boolean;
  readonly authenticationStrength: AuthenticationStrength;
  readonly reauthenticatedAt: Date | null;
}

export interface AuthorizationRequest {
  readonly action: AuthorizationAction;
  readonly actorReference: string;
  readonly actorAccountState: "active" | "invited" | "locked" | "suspended" | "closed";
  readonly actorTrustDomain: "participant" | "committee" | "service";
  readonly roles: readonly AuthorizationRole[];
  readonly authenticationStrength: AuthenticationStrength;
  readonly reauthenticatedAt: Date | null;
  readonly now: Date;
  readonly reauthenticationWindowMs: number;
  readonly actorCommitteeReference: string | null;
  readonly targetCommitteeReference: string | null;
  readonly resourceOwnerReference: string | null;
  readonly membershipState: "active" | "proposed" | "suspended" | "retired" | null;
  readonly committeeState:
    "active" | "pilot_approved" | "testnet_ready" | "suspended" | "retired" | null;
  readonly assignedToSession: boolean;
  readonly conflicted: boolean;
  readonly enabledFeatures: readonly string[];
  readonly requiredFeatures: readonly string[];
  readonly requiredPolicyKeys: readonly string[];
  readonly policies: readonly CurrentPolicyGate[];
  readonly statePreconditionsSatisfied: boolean;
  readonly fourEyesApproval?: FourEyesApproval;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly action: AuthorizationAction;
  readonly denial: AuthorizationDenial | null;
  readonly policyVersions: readonly string[];
  readonly digest: string;
}

const capabilities: Readonly<Record<AuthorizationRole, readonly AuthorizationAction[]>> =
  Object.freeze({
    scheduler: ["session.schedule", "session.assign"],
    reviewer: ["verification.review", "verification.approve"],
    signer: ["attestation.sign", "attestation.issue"],
    administrator: [
      "session.schedule",
      "session.assign",
      "attestation.issue",
      "attestation.revoke",
      "committee.manage_roles",
      "client.rotate_key",
    ],
    privacy: ["participant.export_sensitive", "privacy.fulfil_request"],
    security: ["security.inspect", "security.revoke_sessions"],
    support: ["support.recover_account"],
    steward: [
      "committee.manage_roles",
      "committee.suspend",
      "client.rotate_key",
      "policy.manage",
      "release.manage",
      "security.revoke_sessions",
    ],
    relying_party: ["relying_party.read_status"],
  });

const ownResourceActions = new Set<AuthorizationAction>([
  "participant.read_own",
  "participant.update_own",
  "participant.appeal",
  "participant.close_account",
  "participant.export_sensitive",
  "participant.link_verus",
  "participant.unlink_verus",
  "participant.publish_public_proof",
]);

const privilegedActions = new Set<AuthorizationAction>([
  "participant.appeal",
  "participant.close_account",
  "participant.export_sensitive",
  "participant.link_verus",
  "participant.unlink_verus",
  "participant.publish_public_proof",
  "attestation.issue",
  "attestation.revoke",
  "committee.manage_roles",
  "committee.suspend",
  "client.rotate_key",
  "policy.manage",
  "release.manage",
  "security.revoke_sessions",
]);

const decisionActions = new Set<AuthorizationAction>([
  "verification.review",
  "verification.approve",
  "attestation.sign",
]);

const fourEyesActions = new Set<AuthorizationAction>([
  "committee.suspend",
  "policy.manage",
  "release.manage",
]);

function makeDecision(
  request: AuthorizationRequest,
  denial: AuthorizationDenial | null,
): AuthorizationDecision {
  const versions = request.policies.map(({ policyKey, version }) => `${policyKey}:${version}`);
  const canonical = JSON.stringify({
    action: request.action,
    actorReference: request.actorReference,
    targetCommitteeReference: request.targetCommitteeReference,
    allowed: denial === null,
    denial,
    policyVersions: versions,
  });
  return Object.freeze({
    allowed: denial === null,
    action: request.action,
    denial,
    policyVersions: Object.freeze(versions),
    digest: createHash("sha256").update(canonical, "utf8").digest("hex"),
  });
}

function recentStrong(
  strength: AuthenticationStrength,
  reauthenticatedAt: Date | null,
  now: Date,
  windowMs: number,
): boolean {
  return (
    strength === "passkey" &&
    reauthenticatedAt !== null &&
    now.getTime() - reauthenticatedAt.getTime() >= 0 &&
    now.getTime() - reauthenticatedAt.getTime() <= windowMs
  );
}

function currentPolicies(request: AuthorizationRequest): boolean {
  return request.requiredPolicyKeys.every((requiredPolicyKey) => {
    const policy = request.policies.find(({ policyKey }) => policyKey === requiredPolicyKey);
    return (
      policy !== undefined &&
      policy.effectiveAt <= request.now &&
      (policy.expiresAt === null || policy.expiresAt > request.now) &&
      policy.acknowledgedVersion === policy.version
    );
  });
}

export function authorize(request: AuthorizationRequest): AuthorizationDecision {
  let denial: AuthorizationDenial | null = null;

  if (request.actorAccountState !== "active") {
    denial = "account_inactive";
  } else if (ownResourceActions.has(request.action)) {
    if (request.actorTrustDomain !== "participant") denial = "wrong_trust_domain";
    else if (request.resourceOwnerReference !== request.actorReference) denial = "not_own_resource";
  } else {
    const expectedDomain = request.roles.includes("relying_party") ? "service" : "committee";
    if (request.actorTrustDomain !== expectedDomain) denial = "wrong_trust_domain";
    else if (!request.roles.some((role) => capabilities[role].includes(request.action))) {
      denial = "action_not_granted";
    } else if (
      request.action !== "relying_party.read_status" &&
      request.actorCommitteeReference !== request.targetCommitteeReference
    ) {
      denial = "cross_committee";
    } else if (
      request.action !== "relying_party.read_status" &&
      request.committeeState !== "active"
    ) {
      denial = "committee_inactive";
    } else if (
      request.action !== "relying_party.read_status" &&
      request.membershipState !== "active"
    ) {
      denial = "membership_inactive";
    } else if (decisionActions.has(request.action) && request.conflicted) {
      denial = "conflict_declared";
    } else if (decisionActions.has(request.action) && !request.assignedToSession) {
      denial = "session_not_assigned";
    }
  }

  if (!denial && !request.statePreconditionsSatisfied) denial = "state_precondition_failed";
  if (
    !denial &&
    request.requiredFeatures.some((feature) => !request.enabledFeatures.includes(feature))
  ) {
    denial = "feature_disabled";
  }
  if (!denial && !currentPolicies(request)) denial = "policy_missing_or_expired";
  if (
    !denial &&
    privilegedActions.has(request.action) &&
    !recentStrong(
      request.authenticationStrength,
      request.reauthenticatedAt,
      request.now,
      request.reauthenticationWindowMs,
    )
  ) {
    denial = "reauthentication_required";
  }
  if (!denial && fourEyesActions.has(request.action)) {
    const approval = request.fourEyesApproval;
    if (
      !approval ||
      !approval.active ||
      approval.approverReference === request.actorReference ||
      !approval.approverRoles.includes("steward") ||
      !recentStrong(
        approval.authenticationStrength,
        approval.reauthenticatedAt,
        request.now,
        request.reauthenticationWindowMs,
      )
    ) {
      denial = "four_eyes_required";
    }
  }

  return makeDecision(request, denial);
}

export function requireAuthorization(request: AuthorizationRequest): AuthorizationDecision {
  const decision = authorize(request);
  if (!decision.allowed) {
    if (decision.denial === "reauthentication_required") {
      throw new AuthError("REAUTHENTICATION_REQUIRED");
    }
    if (decision.denial === "policy_missing_or_expired") {
      throw new AuthError("POLICY_REQUIRED");
    }
    throw new AuthError("AUTHORIZATION_DENIED");
  }
  return decision;
}
