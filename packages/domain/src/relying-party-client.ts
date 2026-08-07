import { applyTransition } from "./transition.js";

export const RELYING_PARTY_CLIENT_STATES = [
  "proposed",
  "security_review",
  "approved",
  "active",
  "suspended",
  "revoked",
] as const;
export type RelyingPartyClientState = (typeof RELYING_PARTY_CLIENT_STATES)[number];

function transition(
  command: string,
  state: RelyingPartyClientState,
  expected: readonly RelyingPartyClientState[],
  next: RelyingPartyClientState,
): RelyingPartyClientState {
  return applyTransition("relying_party_client", command, state, expected, next);
}

export const beginClientSecurityReview = (
  state: RelyingPartyClientState,
): RelyingPartyClientState =>
  transition("beginClientSecurityReview", state, ["proposed"], "security_review");
export const approveRelyingPartyClient = (
  state: RelyingPartyClientState,
): RelyingPartyClientState =>
  transition("approveRelyingPartyClient", state, ["security_review"], "approved");
export const activateRelyingPartyClient = (
  state: RelyingPartyClientState,
): RelyingPartyClientState =>
  transition("activateRelyingPartyClient", state, ["approved", "suspended"], "active");
export const suspendRelyingPartyClient = (
  state: RelyingPartyClientState,
): RelyingPartyClientState =>
  transition("suspendRelyingPartyClient", state, ["active"], "suspended");
export const revokeRelyingPartyClient = (state: RelyingPartyClientState): RelyingPartyClientState =>
  transition("revokeRelyingPartyClient", state, ["approved", "active", "suspended"], "revoked");
