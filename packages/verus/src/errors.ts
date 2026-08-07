export type VerusErrorCode =
  | "RPC_UNAVAILABLE"
  | "RPC_TIMEOUT"
  | "RPC_HTTP_ERROR"
  | "RPC_PROTOCOL_ERROR"
  | "RPC_METHOD_ERROR"
  | "RPC_INVALID_RESULT"
  | "AMBIGUOUS_SUBMISSION"
  | "WRONG_NETWORK"
  | "NODE_UNSYNCED"
  | "NODE_VERSION_UNSUPPORTED"
  | "IDENTITY_STATE_INVALID"
  | "VDXF_ID_MISMATCH"
  | "POLICY_GATE_DISABLED"
  | "PAYLOAD_FORBIDDEN"
  | "PAYLOAD_OVERSIZE"
  | "CONFIRMATION_PENDING"
  | "READBACK_MISMATCH"
  | "REORG_DETECTED";

export class VerusIntegrationError extends Error {
  constructor(
    readonly code: VerusErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly submissionAmbiguous = false,
  ) {
    super(message);
    this.name = "VerusIntegrationError";
  }
}

export function isVerusIntegrationError(error: unknown): error is VerusIntegrationError {
  return error instanceof VerusIntegrationError;
}
