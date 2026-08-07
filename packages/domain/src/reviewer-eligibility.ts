export type ReviewerIneligibilityCode =
  "REVIEWER_NOT_AUTHORIZED" | "REVIEWER_CONFLICTED" | "CROSS_COMMITTEE_REVIEW";

export class ReviewerIneligibleError extends Error {
  constructor(readonly code: ReviewerIneligibilityCode) {
    super(code);
    this.name = "ReviewerIneligibleError";
  }
}

export interface ReviewerAuthorizationDecision {
  readonly actorReference: string;
  readonly actorCommitteeReference: string;
  readonly targetCommitteeReference: string;
  readonly authorized: boolean;
  readonly conflicted: boolean;
  readonly policyVersionReference: string;
}

export interface EligibleReviewer {
  readonly actorReference: string;
  readonly committeeReference: string;
  readonly policyVersionReference: string;
}

export function requireEligibleReviewer(decision: ReviewerAuthorizationDecision): EligibleReviewer {
  if (decision.actorCommitteeReference !== decision.targetCommitteeReference) {
    throw new ReviewerIneligibleError("CROSS_COMMITTEE_REVIEW");
  }
  if (!decision.authorized) {
    throw new ReviewerIneligibleError("REVIEWER_NOT_AUTHORIZED");
  }
  if (decision.conflicted) {
    throw new ReviewerIneligibleError("REVIEWER_CONFLICTED");
  }
  if (!decision.policyVersionReference) {
    throw new ReviewerIneligibleError("REVIEWER_NOT_AUTHORIZED");
  }

  return Object.freeze({
    actorReference: decision.actorReference,
    committeeReference: decision.targetCommitteeReference,
    policyVersionReference: decision.policyVersionReference,
  });
}
