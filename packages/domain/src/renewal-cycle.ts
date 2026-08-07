import { applyTransition } from "./transition.js";

export const RENEWAL_CYCLE_STATES = [
  "draft",
  "snapshot_committed",
  "selection_pending",
  "selection_ready",
  "notices_pending",
  "in_progress",
  "reporting",
  "published",
  "cancelled",
] as const;

export type RenewalCycleState = (typeof RENEWAL_CYCLE_STATES)[number];

function transition(
  command: string,
  currentState: RenewalCycleState,
  expectedStates: readonly RenewalCycleState[],
  nextState: RenewalCycleState,
): RenewalCycleState {
  return applyTransition("renewal_cycle", command, currentState, expectedStates, nextState);
}

export const commitEligibleSnapshot = (state: RenewalCycleState): RenewalCycleState =>
  transition("commitEligibleSnapshot", state, ["draft"], "snapshot_committed");

export const requestRenewalSelection = (state: RenewalCycleState): RenewalCycleState =>
  transition("requestRenewalSelection", state, ["snapshot_committed"], "selection_pending");

export const recordRenewalSelection = (state: RenewalCycleState): RenewalCycleState =>
  transition("recordRenewalSelection", state, ["selection_pending"], "selection_ready");

export const queueRenewalNotices = (state: RenewalCycleState): RenewalCycleState =>
  transition("queueRenewalNotices", state, ["selection_ready"], "notices_pending");

export const beginRenewalCycle = (state: RenewalCycleState): RenewalCycleState =>
  transition("beginRenewalCycle", state, ["notices_pending"], "in_progress");

export const beginRenewalReporting = (state: RenewalCycleState): RenewalCycleState =>
  transition("beginRenewalReporting", state, ["in_progress"], "reporting");

export const publishRenewalReport = (state: RenewalCycleState): RenewalCycleState =>
  transition("publishRenewalReport", state, ["reporting"], "published");

export const cancelDraftRenewalCycle = (state: RenewalCycleState): RenewalCycleState =>
  transition("cancelDraftRenewalCycle", state, ["draft"], "cancelled");
