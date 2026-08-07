import { describe, expect, it } from "vitest";

import {
  acknowledgeConsent,
  activateRelyingPartyClient,
  APPEAL_STATES,
  approveRelyingPartyClient,
  assignAppeal,
  beginAppealReview,
  beginClientSecurityReview,
  beginPrivacyRequest,
  beginRenewalCycle,
  beginRenewalReporting,
  cancelDraftRenewalCycle,
  cancelPendingNotification,
  claimNotification,
  commitEligibleSnapshot,
  completePrivacyRequest,
  confirmPrivacyRequester,
  CONSENT_STATES,
  consumeWalletChallenge,
  deadLetterNotification,
  denyAppealCase,
  denyPrivacyRequest,
  expireWalletChallenge,
  InvalidTransitionError,
  NOTIFICATION_STATES,
  presentWalletChallenge,
  PRIVACY_REQUEST_STATES,
  publishRenewalReport,
  queueRenewalNotices,
  recordNotificationDelivery,
  recordRenewalSelection,
  recordRetryableNotificationFailure,
  recordTerminalNotificationFailure,
  recordWalletResponse,
  rejectWalletResponse,
  RELYING_PARTY_CLIENT_STATES,
  remandAppealCase,
  RENEWAL_CYCLE_STATES,
  requestRenewalSelection,
  retryNotification,
  revokeRelyingPartyClient,
  suspendRelyingPartyClient,
  upholdAppealCase,
  WALLET_CHALLENGE_STATES,
  withdrawAppealCase,
  withdrawConsent,
  withdrawPrivacyRequest,
  type AppealState,
  type ConsentState,
  type NotificationState,
  type PrivacyRequestState,
  type RelyingPartyClientState,
  type RenewalCycleState,
  type WalletChallengeState,
} from "./index.js";

interface TransitionCase<State extends string> {
  readonly command: (state: State) => State;
  readonly from: State | readonly State[];
  readonly to: State;
}

function verifyTransitionTable<State extends string>(
  states: readonly State[],
  transitions: readonly TransitionCase<State>[],
): void {
  for (const { command, from, to } of transitions) {
    const allowed = Array.isArray(from) ? (from as readonly State[]) : [from as State];
    for (const allowedState of allowed) {
      expect(command(allowedState)).toBe(to);
    }
    for (const prohibitedState of states.filter((state) => !allowed.includes(state))) {
      expect(() => command(prohibitedState)).toThrow(InvalidTransitionError);
    }
  }
}

describe("policy-neutral supporting lifecycles", () => {
  it("covers every renewal-cycle command without choosing a selection algorithm", () => {
    verifyTransitionTable<RenewalCycleState>(RENEWAL_CYCLE_STATES, [
      { command: commitEligibleSnapshot, from: "draft", to: "snapshot_committed" },
      {
        command: requestRenewalSelection,
        from: "snapshot_committed",
        to: "selection_pending",
      },
      { command: recordRenewalSelection, from: "selection_pending", to: "selection_ready" },
      { command: queueRenewalNotices, from: "selection_ready", to: "notices_pending" },
      { command: beginRenewalCycle, from: "notices_pending", to: "in_progress" },
      { command: beginRenewalReporting, from: "in_progress", to: "reporting" },
      { command: publishRenewalReport, from: "reporting", to: "published" },
      { command: cancelDraftRenewalCycle, from: "draft", to: "cancelled" },
    ]);
  });

  it("covers wallet challenge replay and expiry terminals", () => {
    verifyTransitionTable<WalletChallengeState>(WALLET_CHALLENGE_STATES, [
      { command: presentWalletChallenge, from: "created", to: "presented" },
      { command: recordWalletResponse, from: "presented", to: "response_received" },
      { command: consumeWalletChallenge, from: "response_received", to: "consumed" },
      { command: rejectWalletResponse, from: "response_received", to: "rejected" },
      { command: expireWalletChallenge, from: ["created", "presented"], to: "expired" },
    ]);
  });

  it("covers consent and appeal commands", () => {
    verifyTransitionTable<ConsentState>(CONSENT_STATES, [
      { command: acknowledgeConsent, from: "pending", to: "acknowledged" },
      { command: withdrawConsent, from: "acknowledged", to: "withdrawn" },
    ]);
    verifyTransitionTable<AppealState>(APPEAL_STATES, [
      { command: assignAppeal, from: "opened", to: "assigned" },
      { command: beginAppealReview, from: "assigned", to: "under_review" },
      { command: upholdAppealCase, from: "under_review", to: "upheld" },
      { command: denyAppealCase, from: "under_review", to: "denied" },
      { command: remandAppealCase, from: "under_review", to: "remanded" },
      {
        command: withdrawAppealCase,
        from: ["opened", "assigned", "under_review"],
        to: "withdrawn",
      },
    ]);
  });

  it("covers privacy-rights requests without encoding legal deadlines", () => {
    verifyTransitionTable<PrivacyRequestState>(PRIVACY_REQUEST_STATES, [
      { command: confirmPrivacyRequester, from: "requested", to: "identity_confirmed" },
      { command: beginPrivacyRequest, from: "identity_confirmed", to: "processing" },
      { command: completePrivacyRequest, from: "processing", to: "completed" },
      { command: denyPrivacyRequest, from: "processing", to: "denied" },
      {
        command: withdrawPrivacyRequest,
        from: ["requested", "identity_confirmed", "processing"],
        to: "withdrawn",
      },
    ]);
  });

  it("covers notification retry/dead-letter commands", () => {
    verifyTransitionTable<NotificationState>(NOTIFICATION_STATES, [
      { command: claimNotification, from: "pending", to: "claimed" },
      { command: recordNotificationDelivery, from: "claimed", to: "delivered" },
      {
        command: recordRetryableNotificationFailure,
        from: "claimed",
        to: "retryable_failed",
      },
      { command: retryNotification, from: "retryable_failed", to: "pending" },
      {
        command: recordTerminalNotificationFailure,
        from: "claimed",
        to: "terminal_failed",
      },
      { command: deadLetterNotification, from: "terminal_failed", to: "dead_letter" },
      { command: cancelPendingNotification, from: "pending", to: "cancelled" },
    ]);
  });

  it("covers relying-party registration without granting scopes", () => {
    verifyTransitionTable<RelyingPartyClientState>(RELYING_PARTY_CLIENT_STATES, [
      {
        command: beginClientSecurityReview,
        from: "proposed",
        to: "security_review",
      },
      {
        command: approveRelyingPartyClient,
        from: "security_review",
        to: "approved",
      },
      {
        command: activateRelyingPartyClient,
        from: ["approved", "suspended"],
        to: "active",
      },
      { command: suspendRelyingPartyClient, from: "active", to: "suspended" },
      {
        command: revokeRelyingPartyClient,
        from: ["approved", "active", "suspended"],
        to: "revoked",
      },
    ]);
  });
});
