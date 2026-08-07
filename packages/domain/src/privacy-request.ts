import { applyTransition } from "./transition.js";

export const PRIVACY_REQUEST_STATES = [
  "requested",
  "identity_confirmed",
  "processing",
  "completed",
  "denied",
  "withdrawn",
] as const;
export type PrivacyRequestState = (typeof PRIVACY_REQUEST_STATES)[number];

function transition(
  command: string,
  state: PrivacyRequestState,
  expected: readonly PrivacyRequestState[],
  next: PrivacyRequestState,
): PrivacyRequestState {
  return applyTransition("privacy_request", command, state, expected, next);
}

export const confirmPrivacyRequester = (state: PrivacyRequestState): PrivacyRequestState =>
  transition("confirmPrivacyRequester", state, ["requested"], "identity_confirmed");
export const beginPrivacyRequest = (state: PrivacyRequestState): PrivacyRequestState =>
  transition("beginPrivacyRequest", state, ["identity_confirmed"], "processing");
export const completePrivacyRequest = (state: PrivacyRequestState): PrivacyRequestState =>
  transition("completePrivacyRequest", state, ["processing"], "completed");
export const denyPrivacyRequest = (state: PrivacyRequestState): PrivacyRequestState =>
  transition("denyPrivacyRequest", state, ["processing"], "denied");
export const withdrawPrivacyRequest = (state: PrivacyRequestState): PrivacyRequestState =>
  transition(
    "withdrawPrivacyRequest",
    state,
    ["requested", "identity_confirmed", "processing"],
    "withdrawn",
  );
