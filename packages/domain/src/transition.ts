export type DomainAggregate = "verification" | "committee" | "verus_job";

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_STATE_TRANSITION" as const;

  constructor(
    readonly aggregate: DomainAggregate,
    readonly command: string,
    readonly currentState: string,
    readonly expectedStates: readonly string[],
  ) {
    super(
      `${aggregate} command ${command} cannot run from ${currentState}; expected ${expectedStates.join(" or ")}`,
    );
    this.name = "InvalidTransitionError";
  }
}

export function applyTransition<State extends string>(
  aggregate: DomainAggregate,
  command: string,
  currentState: State,
  expectedStates: readonly State[],
  nextState: State,
): State {
  if (!expectedStates.includes(currentState)) {
    throw new InvalidTransitionError(aggregate, command, currentState, expectedStates);
  }

  return nextState;
}
