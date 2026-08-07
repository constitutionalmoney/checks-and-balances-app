import { applyTransition } from "./transition.js";

export const VERIFICATION_STATES = [
  "requested",
  "scheduled",
  "checked_in",
  "under_review",
  "approved",
  "rejected",
  "needs_more_information",
  "withdrawn",
  "issuance_pending",
  "issued",
  "active",
  "expired",
  "revoked",
  "superseded",
  "appealed",
  "appeal_upheld",
  "appeal_denied",
  "appeal_remanded",
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

function transition(
  command: string,
  currentState: VerificationState,
  expectedState: VerificationState,
  nextState: VerificationState,
): VerificationState {
  return applyTransition("verification", command, currentState, [expectedState], nextState);
}

export function scheduleRequest(currentState: VerificationState): VerificationState {
  return transition("scheduleRequest", currentState, "requested", "scheduled");
}

export function checkInParticipant(currentState: VerificationState): VerificationState {
  return transition("checkInParticipant", currentState, "scheduled", "checked_in");
}

export function beginReview(currentState: VerificationState): VerificationState {
  return transition("beginReview", currentState, "checked_in", "under_review");
}

export function approveVerification(currentState: VerificationState): VerificationState {
  return transition("approveVerification", currentState, "under_review", "approved");
}

export function rejectVerification(currentState: VerificationState): VerificationState {
  return transition("rejectVerification", currentState, "under_review", "rejected");
}

export function requestMoreInformation(currentState: VerificationState): VerificationState {
  return transition(
    "requestMoreInformation",
    currentState,
    "under_review",
    "needs_more_information",
  );
}

export function withdrawVerification(currentState: VerificationState): VerificationState {
  return transition("withdrawVerification", currentState, "under_review", "withdrawn");
}

export function rescheduleAfterMoreInformation(currentState: VerificationState): VerificationState {
  return transition(
    "rescheduleAfterMoreInformation",
    currentState,
    "needs_more_information",
    "scheduled",
  );
}

export function rejectAfterMoreInformation(currentState: VerificationState): VerificationState {
  return transition(
    "rejectAfterMoreInformation",
    currentState,
    "needs_more_information",
    "rejected",
  );
}

export function withdrawAfterMoreInformation(currentState: VerificationState): VerificationState {
  return transition(
    "withdrawAfterMoreInformation",
    currentState,
    "needs_more_information",
    "withdrawn",
  );
}

export function requestIssuance(currentState: VerificationState): VerificationState {
  return transition("requestIssuance", currentState, "approved", "issuance_pending");
}

export function recordIssuance(currentState: VerificationState): VerificationState {
  return transition("recordIssuance", currentState, "issuance_pending", "issued");
}

export function activateAttestation(currentState: VerificationState): VerificationState {
  return transition("activateAttestation", currentState, "issued", "active");
}

export function expireAttestation(currentState: VerificationState): VerificationState {
  return transition("expireAttestation", currentState, "active", "expired");
}

export function revokeAttestation(currentState: VerificationState): VerificationState {
  return transition("revokeAttestation", currentState, "active", "revoked");
}

export function supersedeAttestation(currentState: VerificationState): VerificationState {
  return transition("supersedeAttestation", currentState, "active", "superseded");
}

export function openAppeal(currentState: VerificationState): VerificationState {
  return transition("openAppeal", currentState, "rejected", "appealed");
}

export function upholdAppeal(currentState: VerificationState): VerificationState {
  return transition("upholdAppeal", currentState, "appealed", "appeal_upheld");
}

export function denyAppeal(currentState: VerificationState): VerificationState {
  return transition("denyAppeal", currentState, "appealed", "appeal_denied");
}

export function remandAppeal(currentState: VerificationState): VerificationState {
  return transition("remandAppeal", currentState, "appealed", "appeal_remanded");
}
