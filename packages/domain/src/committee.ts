import { applyTransition } from "./transition.js";

export const COMMITTEE_STATES = [
  "proposed",
  "forming",
  "policy_review",
  "testnet_provisioning",
  "testnet_ready",
  "pilot_review",
  "pilot_approved",
  "active",
  "suspended",
  "retired",
] as const;

export type CommitteeState = (typeof COMMITTEE_STATES)[number];

function transition(
  command: string,
  currentState: CommitteeState,
  expectedState: CommitteeState,
  nextState: CommitteeState,
): CommitteeState {
  return applyTransition("committee", command, currentState, [expectedState], nextState);
}

export function beginCommitteeFormation(currentState: CommitteeState): CommitteeState {
  return transition("beginCommitteeFormation", currentState, "proposed", "forming");
}

export function beginCommitteePolicyReview(currentState: CommitteeState): CommitteeState {
  return transition("beginCommitteePolicyReview", currentState, "forming", "policy_review");
}

export function beginTestnetProvisioning(currentState: CommitteeState): CommitteeState {
  return transition(
    "beginTestnetProvisioning",
    currentState,
    "policy_review",
    "testnet_provisioning",
  );
}

export function markCommitteeTestnetReady(currentState: CommitteeState): CommitteeState {
  return transition(
    "markCommitteeTestnetReady",
    currentState,
    "testnet_provisioning",
    "testnet_ready",
  );
}

export function beginCommitteePilotReview(currentState: CommitteeState): CommitteeState {
  return transition("beginCommitteePilotReview", currentState, "testnet_ready", "pilot_review");
}

export function approveCommitteePilot(currentState: CommitteeState): CommitteeState {
  return transition("approveCommitteePilot", currentState, "pilot_review", "pilot_approved");
}

export function activateCommittee(currentState: CommitteeState): CommitteeState {
  return transition("activateCommittee", currentState, "pilot_approved", "active");
}

export function suspendCommittee(currentState: CommitteeState): CommitteeState {
  return transition("suspendCommittee", currentState, "pilot_approved", "suspended");
}

export function retireCommittee(currentState: CommitteeState): CommitteeState {
  return transition("retireCommittee", currentState, "pilot_approved", "retired");
}

export function reactivateCommittee(currentState: CommitteeState): CommitteeState {
  return transition("reactivateCommittee", currentState, "suspended", "active");
}

export function retireSuspendedCommittee(currentState: CommitteeState): CommitteeState {
  return transition("retireSuspendedCommittee", currentState, "suspended", "retired");
}
