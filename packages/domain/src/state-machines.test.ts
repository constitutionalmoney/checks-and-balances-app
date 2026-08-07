import { describe, expect, it } from "vitest";

import * as domain from "./index.js";
import {
  activateAttestation,
  activateCommittee,
  approveCommitteePilot,
  approveVerification,
  beginCommitteeFormation,
  beginCommitteePilotReview,
  beginCommitteePolicyReview,
  beginReview,
  beginTestnetProvisioning,
  beginVerusConfirmation,
  beginVerusPreflight,
  beginVerusReadback,
  checkInParticipant,
  claimVerusJob,
  COMMITTEE_STATES,
  denyAppeal,
  expireAttestation,
  InvalidTransitionError,
  markCommitteeTestnetReady,
  markVerusReorgPending,
  openAppeal,
  recordIssuance,
  recordRetryableVerusFailure,
  recordTerminalVerusFailure,
  recordVerusSubmission,
  reactivateCommittee,
  rejectAfterMoreInformation,
  rejectVerification,
  remandAppeal,
  requestIssuance,
  requestMoreInformation,
  rescheduleAfterMoreInformation,
  retireCommittee,
  retireSuspendedCommittee,
  revokeAttestation,
  scheduleRequest,
  supersedeAttestation,
  suspendCommittee,
  upholdAppeal,
  VERIFICATION_STATES,
  VERUS_JOB_STATES,
  verifyVerusReadback,
  withdrawVerification,
  withdrawAfterMoreInformation,
  type CommitteeState,
  type VerificationState,
  type VerusJobState,
} from "./index.js";

describe("public domain API", () => {
  it("does not expose a generic transition command", () => {
    expect(domain).not.toHaveProperty("applyTransition");
  });
});

interface TransitionCase<State extends string> {
  readonly command: (state: State) => State;
  readonly from: State;
  readonly to: State;
}

function verifyTransitionTable<State extends string>(
  states: readonly State[],
  transitions: readonly TransitionCase<State>[],
): void {
  for (const { command, from, to } of transitions) {
    expect(command(from)).toBe(to);

    for (const prohibitedState of states.filter((state) => state !== from)) {
      expect(() => command(prohibitedState)).toThrow(InvalidTransitionError);
    }
  }
}

describe("verification and attestation lifecycle", () => {
  const transitions: readonly TransitionCase<VerificationState>[] = [
    { command: scheduleRequest, from: "requested", to: "scheduled" },
    { command: checkInParticipant, from: "scheduled", to: "checked_in" },
    { command: beginReview, from: "checked_in", to: "under_review" },
    { command: approveVerification, from: "under_review", to: "approved" },
    { command: rejectVerification, from: "under_review", to: "rejected" },
    {
      command: requestMoreInformation,
      from: "under_review",
      to: "needs_more_information",
    },
    { command: withdrawVerification, from: "under_review", to: "withdrawn" },
    {
      command: rescheduleAfterMoreInformation,
      from: "needs_more_information",
      to: "scheduled",
    },
    {
      command: rejectAfterMoreInformation,
      from: "needs_more_information",
      to: "rejected",
    },
    {
      command: withdrawAfterMoreInformation,
      from: "needs_more_information",
      to: "withdrawn",
    },
    { command: requestIssuance, from: "approved", to: "issuance_pending" },
    { command: recordIssuance, from: "issuance_pending", to: "issued" },
    { command: activateAttestation, from: "issued", to: "active" },
    { command: expireAttestation, from: "active", to: "expired" },
    { command: revokeAttestation, from: "active", to: "revoked" },
    { command: supersedeAttestation, from: "active", to: "superseded" },
    { command: openAppeal, from: "rejected", to: "appealed" },
    { command: upholdAppeal, from: "appealed", to: "appeal_upheld" },
    { command: denyAppeal, from: "appealed", to: "appeal_denied" },
    { command: remandAppeal, from: "appealed", to: "appeal_remanded" },
  ];

  it("allows only the issue-defined named transitions", () => {
    verifyTransitionTable(VERIFICATION_STATES, transitions);
  });

  it("cannot jump directly from requested to active", () => {
    for (const { command } of transitions.filter(({ command }) => command !== scheduleRequest)) {
      expect(() => command("requested")).toThrow(InvalidTransitionError);
    }
  });
});

describe("committee lifecycle", () => {
  it("allows only the issue-defined named transitions", () => {
    verifyTransitionTable<CommitteeState>(COMMITTEE_STATES, [
      { command: beginCommitteeFormation, from: "proposed", to: "forming" },
      { command: beginCommitteePolicyReview, from: "forming", to: "policy_review" },
      {
        command: beginTestnetProvisioning,
        from: "policy_review",
        to: "testnet_provisioning",
      },
      {
        command: markCommitteeTestnetReady,
        from: "testnet_provisioning",
        to: "testnet_ready",
      },
      { command: beginCommitteePilotReview, from: "testnet_ready", to: "pilot_review" },
      { command: approveCommitteePilot, from: "pilot_review", to: "pilot_approved" },
      { command: activateCommittee, from: "pilot_approved", to: "active" },
      { command: suspendCommittee, from: "pilot_approved", to: "suspended" },
      { command: retireCommittee, from: "pilot_approved", to: "retired" },
      { command: reactivateCommittee, from: "suspended", to: "active" },
      { command: retireSuspendedCommittee, from: "suspended", to: "retired" },
    ]);
  });
});

describe("Verus job lifecycle", () => {
  it("allows only the issue-defined named transitions", () => {
    const cases = [
      {
        command: claimVerusJob,
        allowed: ["pending", "retryable_failed", "reorg_pending"],
        to: "claimed",
      },
      { command: beginVerusPreflight, allowed: ["claimed"], to: "preflight" },
      { command: recordVerusSubmission, allowed: ["preflight"], to: "submitted" },
      { command: beginVerusConfirmation, allowed: ["submitted"], to: "confirming" },
      { command: beginVerusReadback, allowed: ["confirming"], to: "readback" },
      { command: verifyVerusReadback, allowed: ["readback"], to: "verified" },
      {
        command: recordRetryableVerusFailure,
        allowed: ["preflight", "submitted", "confirming", "readback"],
        to: "retryable_failed",
      },
      {
        command: recordTerminalVerusFailure,
        allowed: ["preflight", "submitted", "confirming", "readback", "retryable_failed"],
        to: "terminal_failed",
      },
      { command: markVerusReorgPending, allowed: ["confirming", "readback"], to: "reorg_pending" },
    ] as const;

    for (const { command, allowed, to } of cases) {
      for (const state of VERUS_JOB_STATES) {
        if ((allowed as readonly VerusJobState[]).includes(state)) {
          expect(command(state)).toBe(to);
        } else {
          expect(() => command(state)).toThrow(InvalidTransitionError);
        }
      }
    }
  });
});
