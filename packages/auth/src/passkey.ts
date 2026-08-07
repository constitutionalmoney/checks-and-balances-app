import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from "@simplewebauthn/server";

import type { AuthChallengeStore } from "./challenge.js";
import { digestMatches, keyedDigest } from "./crypto.js";
import { AuthError } from "./errors.js";
import type { TrustDomain } from "./trust-domain.js";

export interface StoredPasskeyCredential {
  readonly credentialReference: string;
  readonly accountReference: string;
  readonly trustDomain: TrustDomain;
  readonly relyingPartyId: string;
  readonly publicKey: Uint8Array<ArrayBufferLike>;
  readonly counter: number;
  readonly transports: readonly AuthenticatorTransportFuture[];
  readonly deviceType: "singleDevice" | "multiDevice";
  readonly backedUp: boolean;
  readonly deviceLabel: string;
  readonly state: "active" | "disabled" | "revoked";
}

export interface PasskeyRepository {
  listActive(
    accountReference: string,
    trustDomain: TrustDomain,
  ): Promise<readonly StoredPasskeyCredential[]>;
  findActive(
    credentialReference: string,
    trustDomain: TrustDomain,
  ): Promise<StoredPasskeyCredential | null>;
  save(credential: StoredPasskeyCredential, createdAt: Date): Promise<void>;
  updateUsage(input: {
    readonly credentialReference: string;
    readonly counter: number;
    readonly deviceType: "singleDevice" | "multiDevice";
    readonly backedUp: boolean;
    readonly usedAt: Date;
  }): Promise<void>;
  revokeCredential(
    credentialReference: string,
    accountReference: string,
    revokedAt: Date,
  ): Promise<void>;
}

export interface PasskeyDomainConfig {
  readonly relyingPartyName: string;
  readonly relyingPartyId: string;
  readonly origin: string;
  readonly challengeSecret: string;
  readonly challengeLifetimeMs: number;
}

export interface WebAuthnAdapter {
  generateRegistrationOptions: typeof generateRegistrationOptions;
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
}

const defaultWebAuthn: WebAuthnAdapter = {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
};

export interface PasskeyRegistrationStart {
  readonly challengeReference: string;
  readonly options: PublicKeyCredentialCreationOptionsJSON;
}

export interface PasskeyAuthenticationStart {
  readonly challengeReference: string;
  readonly options: PublicKeyCredentialRequestOptionsJSON;
}

export class PasskeyService {
  constructor(
    private readonly repository: PasskeyRepository,
    private readonly challenges: AuthChallengeStore,
    private readonly configs: Readonly<Record<TrustDomain, PasskeyDomainConfig>>,
    private readonly newId: () => string,
    private readonly webAuthn: WebAuthnAdapter = defaultWebAuthn,
  ) {}

  async beginRegistration(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly authorizedBy:
      "initial_verified_email" | "recent_passkey" | "recovery_grant" | "approved_invitation";
    readonly now: Date;
  }): Promise<PasskeyRegistrationStart> {
    const config = this.configs[input.trustDomain];
    const existing = await this.repository.listActive(input.accountReference, input.trustDomain);
    const authorizedInitialEnrollment =
      existing.length === 0 &&
      ((input.trustDomain === "participant" && input.authorizedBy === "initial_verified_email") ||
        (input.trustDomain === "committee" && input.authorizedBy === "approved_invitation"));
    const authorizedCredentialChange =
      input.authorizedBy === "recent_passkey" ||
      (input.trustDomain === "participant" && input.authorizedBy === "recovery_grant");
    if (!authorizedInitialEnrollment && !authorizedCredentialChange) {
      throw new AuthError("REAUTHENTICATION_REQUIRED");
    }
    const options = await this.webAuthn.generateRegistrationOptions({
      rpName: config.relyingPartyName,
      rpID: config.relyingPartyId,
      userName: input.accountReference,
      userDisplayName: "",
      userID: new TextEncoder().encode(input.accountReference),
      attestationType: "none",
      excludeCredentials: existing.map((credential) => ({
        id: credential.credentialReference,
        transports: [...credential.transports],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    const challengeReference = this.newId();
    await this.challenges.create({
      id: challengeReference,
      accountReference: input.accountReference,
      trustDomain: input.trustDomain,
      kind: "passkey_registration",
      secretDigest: keyedDigest(config.challengeSecret, options.challenge),
      destinationReference: null,
      lookupDigest: null,
      expiresAt: new Date(input.now.getTime() + config.challengeLifetimeMs),
      createdAt: input.now,
    });
    return Object.freeze({ challengeReference, options });
  }

  async finishRegistration(input: {
    readonly trustDomain: TrustDomain;
    readonly challengeReference: string;
    readonly response: RegistrationResponseJSON;
    readonly deviceLabel: string;
    readonly now: Date;
  }): Promise<StoredPasskeyCredential> {
    const config = this.configs[input.trustDomain];
    const challenge = await this.challenges.consume({
      challengeId: input.challengeReference,
      kind: "passkey_registration",
      trustDomain: input.trustDomain,
      at: input.now,
    });
    if (!challenge?.accountReference) throw new AuthError("CHALLENGE_REPLAYED");

    let result: VerifiedRegistrationResponse;
    try {
      result = await this.webAuthn.verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: (value) =>
          digestMatches(challenge.secretDigest, keyedDigest(config.challengeSecret, value)),
        expectedOrigin: config.origin,
        expectedRPID: config.relyingPartyId,
        requireUserPresence: true,
        requireUserVerification: true,
      });
    } catch {
      throw new AuthError("AUTHENTICATION_FAILED");
    }
    if (!result.verified) throw new AuthError("AUTHENTICATION_FAILED");

    const credential: StoredPasskeyCredential = Object.freeze({
      credentialReference: result.registrationInfo.credential.id,
      accountReference: challenge.accountReference,
      trustDomain: input.trustDomain,
      relyingPartyId: config.relyingPartyId,
      publicKey: result.registrationInfo.credential.publicKey,
      counter: result.registrationInfo.credential.counter,
      transports: Object.freeze(result.registrationInfo.credential.transports ?? []),
      deviceType: result.registrationInfo.credentialDeviceType,
      backedUp: result.registrationInfo.credentialBackedUp,
      deviceLabel: input.deviceLabel,
      state: "active",
    });
    await this.repository.save(credential, input.now);
    return credential;
  }

  async beginAuthentication(input: {
    readonly trustDomain: TrustDomain;
    readonly now: Date;
  }): Promise<PasskeyAuthenticationStart> {
    const config = this.configs[input.trustDomain];
    const options = await this.webAuthn.generateAuthenticationOptions({
      rpID: config.relyingPartyId,
      userVerification: "required",
    });
    const challengeReference = this.newId();
    await this.challenges.create({
      id: challengeReference,
      accountReference: null,
      trustDomain: input.trustDomain,
      kind: "passkey_authentication",
      secretDigest: keyedDigest(config.challengeSecret, options.challenge),
      destinationReference: null,
      lookupDigest: null,
      expiresAt: new Date(input.now.getTime() + config.challengeLifetimeMs),
      createdAt: input.now,
    });
    return Object.freeze({ challengeReference, options });
  }

  async finishAuthentication(input: {
    readonly trustDomain: TrustDomain;
    readonly challengeReference: string;
    readonly response: AuthenticationResponseJSON;
    readonly now: Date;
  }): Promise<{ readonly accountReference: string; readonly credentialReference: string }> {
    const config = this.configs[input.trustDomain];
    const challenge = await this.challenges.consume({
      challengeId: input.challengeReference,
      kind: "passkey_authentication",
      trustDomain: input.trustDomain,
      at: input.now,
    });
    if (!challenge) throw new AuthError("CHALLENGE_REPLAYED");
    const credential = await this.repository.findActive(input.response.id, input.trustDomain);
    if (!credential || credential.relyingPartyId !== config.relyingPartyId) {
      throw new AuthError("AUTHENTICATION_FAILED");
    }

    let result: VerifiedAuthenticationResponse;
    try {
      result = await this.webAuthn.verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: (value) =>
          digestMatches(challenge.secretDigest, keyedDigest(config.challengeSecret, value)),
        expectedOrigin: config.origin,
        expectedRPID: config.relyingPartyId,
        credential: {
          id: credential.credentialReference,
          publicKey: Uint8Array.from(credential.publicKey),
          counter: credential.counter,
          transports: [...credential.transports],
        },
        requireUserVerification: true,
      });
    } catch {
      throw new AuthError("AUTHENTICATION_FAILED");
    }
    if (!result.verified || !result.authenticationInfo.userVerified) {
      throw new AuthError("AUTHENTICATION_FAILED");
    }
    await this.repository.updateUsage({
      credentialReference: credential.credentialReference,
      counter: result.authenticationInfo.newCounter,
      deviceType: result.authenticationInfo.credentialDeviceType,
      backedUp: result.authenticationInfo.credentialBackedUp,
      usedAt: input.now,
    });
    return Object.freeze({
      accountReference: credential.accountReference,
      credentialReference: credential.credentialReference,
    });
  }

  async revokeCredential(input: {
    readonly credentialReference: string;
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly recentlyReauthenticated: boolean;
    readonly alternateRecoveryAvailable: boolean;
    readonly now: Date;
  }): Promise<void> {
    if (!input.recentlyReauthenticated) throw new AuthError("REAUTHENTICATION_REQUIRED");
    const active = await this.repository.listActive(input.accountReference, input.trustDomain);
    if (active.length <= 1 && !input.alternateRecoveryAvailable) {
      throw new AuthError("AUTHORIZATION_DENIED");
    }
    await this.repository.revokeCredential(
      input.credentialReference,
      input.accountReference,
      input.now,
    );
  }
}
