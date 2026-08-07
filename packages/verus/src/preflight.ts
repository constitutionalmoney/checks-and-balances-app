import { VerusIntegrationError } from "./errors.js";
import {
  MINIMUM_VERUS_NODE_VERSION,
  VRSCTEST_CHAIN_ID,
  VRSCTEST_NETWORK,
  type VerusBlockchainInfo,
  type VerusIdentityResult,
  type VerusInfo,
  type VerusRpcAdapter,
  type VerusVdxfId,
} from "./types.js";

export interface ExpectedVerusIdentity {
  readonly identityAddress: string;
  readonly systemId: string;
  readonly allowedStatuses: readonly string[];
  readonly mustBeSignableByNode: boolean;
}

export interface ExpectedVdxfIdentifier {
  readonly uri: string;
  readonly vdxfId: string;
}

export interface VerusWritePreflightPolicy {
  readonly serverSelectedNetwork: string;
  readonly expectedChainId?: string;
  readonly minimumNodeVersion?: number;
  readonly minimumVerificationProgress?: number;
  readonly maximumHeaderLag?: number;
  readonly maximumObservationSkew?: number;
  readonly requirePeers?: boolean;
  readonly expectedIdentity?: ExpectedVerusIdentity;
  readonly expectedVdxf?: ExpectedVdxfIdentifier;
  readonly writeCapabilityEnabled: boolean;
}

export interface VerusWritePreflightResult {
  readonly info: VerusInfo;
  readonly blockchain: VerusBlockchainInfo;
  readonly identity?: VerusIdentityResult;
  readonly vdxf?: VerusVdxfId;
}

export async function runVerusWritePreflight(
  adapter: VerusRpcAdapter,
  policy: VerusWritePreflightPolicy,
): Promise<VerusWritePreflightResult> {
  if (policy.serverSelectedNetwork !== VRSCTEST_NETWORK) {
    throw new VerusIntegrationError(
      "WRONG_NETWORK",
      "Verus writes require the server-selected VRSCTEST network",
      false,
    );
  }

  const [info, blockchain] = await Promise.all([adapter.getInfo(), adapter.getBlockchainInfo()]);
  const expectedChainId = policy.expectedChainId ?? VRSCTEST_CHAIN_ID;
  if (
    !info.testnet ||
    info.name !== VRSCTEST_NETWORK ||
    info.chainId !== expectedChainId ||
    blockchain.name !== VRSCTEST_NETWORK ||
    blockchain.chainId !== expectedChainId ||
    blockchain.chain !== "test"
  ) {
    throw new VerusIntegrationError(
      "WRONG_NETWORK",
      "Verus node did not report the expected VRSCTEST system and chain identifier",
      false,
    );
  }

  const minimumNodeVersion = policy.minimumNodeVersion ?? MINIMUM_VERUS_NODE_VERSION;
  if (info.version < minimumNodeVersion) {
    throw new VerusIntegrationError(
      "NODE_VERSION_UNSUPPORTED",
      "Verus node version is below the supported VRSCTEST baseline",
      false,
    );
  }

  const maximumHeaderLag = policy.maximumHeaderLag ?? 0;
  const minimumVerificationProgress = policy.minimumVerificationProgress ?? 0.999_999;
  const maximumObservationSkew = policy.maximumObservationSkew ?? 1;
  const headerLag = blockchain.headers - blockchain.blocks;
  if (
    headerLag < 0 ||
    headerLag > maximumHeaderLag ||
    blockchain.verificationProgress < minimumVerificationProgress ||
    Math.abs(info.blocks - blockchain.blocks) > maximumObservationSkew ||
    info.longestChain < info.blocks ||
    info.errors.trim().length > 0 ||
    ((policy.requirePeers ?? true) && info.connections < 1)
  ) {
    throw new VerusIntegrationError(
      "NODE_UNSYNCED",
      "Verus node is not ready and synchronized for write work",
      true,
    );
  }

  let identity: VerusIdentityResult | undefined;
  if (policy.writeCapabilityEnabled && (!policy.expectedIdentity || !policy.expectedVdxf)) {
    throw new VerusIntegrationError(
      "POLICY_GATE_DISABLED",
      "Enabled Verus writes require approved identity and VDXF server fixtures",
      false,
    );
  }
  if (policy.expectedIdentity) {
    identity = await adapter.getIdentity({ identity: policy.expectedIdentity.identityAddress });
    if (
      identity.identity.identityAddress !== policy.expectedIdentity.identityAddress ||
      identity.identity.systemId !== policy.expectedIdentity.systemId ||
      !policy.expectedIdentity.allowedStatuses.includes(identity.status) ||
      (policy.expectedIdentity.mustBeSignableByNode && !identity.canSignFor)
    ) {
      throw new VerusIntegrationError(
        "IDENTITY_STATE_INVALID",
        "Expected Verus identity is unavailable, changed, recovered, revoked, or not signable",
        false,
      );
    }
  }

  let vdxf: VerusVdxfId | undefined;
  if (policy.expectedVdxf) {
    vdxf = await adapter.getVdxfId(policy.expectedVdxf.uri);
    if (vdxf.vdxfId !== policy.expectedVdxf.vdxfId) {
      throw new VerusIntegrationError(
        "VDXF_ID_MISMATCH",
        "Derived VDXF identifier does not match the approved server fixture",
        false,
      );
    }
  }

  if (!policy.writeCapabilityEnabled) {
    throw new VerusIntegrationError(
      "POLICY_GATE_DISABLED",
      "Verus anchor writes remain disabled by the server release and policy gate",
      false,
    );
  }

  return {
    info,
    blockchain,
    ...(identity ? { identity } : {}),
    ...(vdxf ? { vdxf } : {}),
  };
}
