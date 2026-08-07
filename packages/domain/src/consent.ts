import { applyTransition } from "./transition.js";

export const CONSENT_STATES = ["pending", "acknowledged", "withdrawn"] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

export const acknowledgeConsent = (state: ConsentState): ConsentState =>
  applyTransition("consent", "acknowledgeConsent", state, ["pending"], "acknowledged");

export const withdrawConsent = (state: ConsentState): ConsentState =>
  applyTransition("consent", "withdrawConsent", state, ["acknowledged"], "withdrawn");
