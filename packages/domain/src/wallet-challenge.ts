import { applyTransition } from "./transition.js";

export const WALLET_CHALLENGE_STATES = [
  "created",
  "presented",
  "response_received",
  "consumed",
  "expired",
  "rejected",
] as const;

export type WalletChallengeState = (typeof WALLET_CHALLENGE_STATES)[number];

function transition(
  command: string,
  state: WalletChallengeState,
  expected: readonly WalletChallengeState[],
  next: WalletChallengeState,
): WalletChallengeState {
  return applyTransition("wallet_challenge", command, state, expected, next);
}

export const presentWalletChallenge = (state: WalletChallengeState): WalletChallengeState =>
  transition("presentWalletChallenge", state, ["created"], "presented");

export const recordWalletResponse = (state: WalletChallengeState): WalletChallengeState =>
  transition("recordWalletResponse", state, ["presented"], "response_received");

export const consumeWalletChallenge = (state: WalletChallengeState): WalletChallengeState =>
  transition("consumeWalletChallenge", state, ["response_received"], "consumed");

export const rejectWalletResponse = (state: WalletChallengeState): WalletChallengeState =>
  transition("rejectWalletResponse", state, ["response_received"], "rejected");

export const expireWalletChallenge = (state: WalletChallengeState): WalletChallengeState =>
  transition("expireWalletChallenge", state, ["created", "presented"], "expired");
