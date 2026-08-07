import { applyTransition } from "./transition.js";

export const APPEAL_STATES = [
  "opened",
  "assigned",
  "under_review",
  "upheld",
  "denied",
  "remanded",
  "withdrawn",
] as const;
export type AppealState = (typeof APPEAL_STATES)[number];

function transition(
  command: string,
  state: AppealState,
  expected: readonly AppealState[],
  next: AppealState,
): AppealState {
  return applyTransition("appeal", command, state, expected, next);
}

export const assignAppeal = (state: AppealState): AppealState =>
  transition("assignAppeal", state, ["opened"], "assigned");
export const beginAppealReview = (state: AppealState): AppealState =>
  transition("beginAppealReview", state, ["assigned"], "under_review");
export const upholdAppealCase = (state: AppealState): AppealState =>
  transition("upholdAppealCase", state, ["under_review"], "upheld");
export const denyAppealCase = (state: AppealState): AppealState =>
  transition("denyAppealCase", state, ["under_review"], "denied");
export const remandAppealCase = (state: AppealState): AppealState =>
  transition("remandAppealCase", state, ["under_review"], "remanded");
export const withdrawAppealCase = (state: AppealState): AppealState =>
  transition("withdrawAppealCase", state, ["opened", "assigned", "under_review"], "withdrawn");
