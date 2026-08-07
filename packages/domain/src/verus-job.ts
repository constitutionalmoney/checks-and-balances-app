import { applyTransition } from "./transition.js";

export const VERUS_JOB_STATES = [
  "pending",
  "claimed",
  "preflight",
  "submitted",
  "confirming",
  "readback",
  "verified",
  "retryable_failed",
  "terminal_failed",
  "reorg_pending",
] as const;

export type VerusJobState = (typeof VERUS_JOB_STATES)[number];

function transition(
  command: string,
  currentState: VerusJobState,
  expectedStates: readonly VerusJobState[],
  nextState: VerusJobState,
): VerusJobState {
  return applyTransition("verus_job", command, currentState, expectedStates, nextState);
}

export function claimVerusJob(currentState: VerusJobState): VerusJobState {
  return transition(
    "claimVerusJob",
    currentState,
    ["pending", "retryable_failed", "reorg_pending"],
    "claimed",
  );
}

export function beginVerusPreflight(currentState: VerusJobState): VerusJobState {
  return transition("beginVerusPreflight", currentState, ["claimed"], "preflight");
}

export function recordVerusSubmission(currentState: VerusJobState): VerusJobState {
  return transition("recordVerusSubmission", currentState, ["preflight"], "submitted");
}

export function beginVerusConfirmation(currentState: VerusJobState): VerusJobState {
  return transition("beginVerusConfirmation", currentState, ["submitted"], "confirming");
}

export function beginVerusReadback(currentState: VerusJobState): VerusJobState {
  return transition("beginVerusReadback", currentState, ["confirming"], "readback");
}

export function verifyVerusReadback(currentState: VerusJobState): VerusJobState {
  return transition("verifyVerusReadback", currentState, ["readback"], "verified");
}

export function recordRetryableVerusFailure(currentState: VerusJobState): VerusJobState {
  return transition(
    "recordRetryableVerusFailure",
    currentState,
    ["preflight", "submitted", "confirming", "readback"],
    "retryable_failed",
  );
}

export function recordTerminalVerusFailure(currentState: VerusJobState): VerusJobState {
  return transition(
    "recordTerminalVerusFailure",
    currentState,
    ["preflight", "submitted", "confirming", "readback", "retryable_failed"],
    "terminal_failed",
  );
}

export function markVerusReorgPending(currentState: VerusJobState): VerusJobState {
  return transition(
    "markVerusReorgPending",
    currentState,
    ["confirming", "readback"],
    "reorg_pending",
  );
}
