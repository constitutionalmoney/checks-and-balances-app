import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

function block(source: string, declaration: string): string {
  const match = source.match(new RegExp(`${declaration}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match?.[1]) throw new Error(`Missing ${declaration}`);
  return match[1];
}

describe("issue #17 authentication contract", () => {
  it("persists only digests for sessions, challenges, and abuse buckets", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    const session = block(schema, "model AuthSession");
    const challenge = block(schema, "model AuthChallenge");
    const rateLimit = block(schema, "model AuthRateLimitBucket");

    expect(session).toContain("tokenDigest");
    expect(session).toContain("csrfDigest");
    expect(challenge).toContain("secretDigest");
    expect(rateLimit).toContain("keyDigest");
    expect(`${session}\n${challenge}\n${rateLimit}`).not.toMatch(
      /rawToken|tokenValue|rawEmail|emailAddress|recoveryToken|challengeValue/i,
    );
  });

  it("models distinct trust domains, strong sessions, recovery, invitation approval, and four eyes", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    for (const declaration of [
      "enum AuthTrustDomain",
      "model AuthAccount",
      "model AuthSession",
      "model AuthChallenge",
      "model AuthRateLimitBucket",
      "model AuthCommitteeAccess",
      "model ReviewerSessionAssignment",
      "model PrivilegedApproval",
    ]) {
      expect(schema).toContain(`${declaration} {`);
    }
    const migration = await readFile(
      "packages/db/prisma/migrations/20260807060000_issue_17_auth_foundation/migration.sql",
      "utf8",
    );
    for (const guard of [
      "auth_session_committee_strength_check",
      "auth_committee_access_approval_check",
      "privileged_approval_distinct_actor_check",
      "auth_session_identity_immutable",
      "auth_challenge_identity_immutable",
      "auth_session_trust_domain_match",
      "auth_challenge_trust_domain_match",
      "contact_preference_auth_subject_match",
      "auth_committee_access_account_domain",
      "privileged_approval_account_domains",
      "reviewer_session_assignment_session_tenant_fkey",
      "reviewer_session_assignment_member_tenant_fkey",
    ]) {
      expect(migration).toContain(guard);
    }
  });

  it("keeps participant and committee origins, keys, audiences, cookies, and RP IDs separate", async () => {
    const config = await readFile("packages/config/src/index.ts", "utf8");
    const trust = await readFile("packages/auth/src/trust-domain.ts", "utf8");

    for (const setting of [
      "CBC_PARTICIPANT_SESSION_AUDIENCE",
      "CBC_COMMITTEE_SESSION_AUDIENCE",
      "CBC_PARTICIPANT_ORIGIN",
      "CBC_COMMITTEE_ORIGIN",
      "CBC_PARTICIPANT_RELYING_PARTY_ID",
      "CBC_COMMITTEE_RELYING_PARTY_ID",
      "CBC_PARTICIPANT_AUTH_SECRET",
      "CBC_COMMITTEE_AUTH_SECRET",
      "CBC_PARTICIPANT_SESSION_KEY_VERSION",
      "CBC_COMMITTEE_SESSION_KEY_VERSION",
    ]) {
      expect(config).toContain(setting);
    }
    expect(trust).toContain("__Host-");
    expect(trust).toContain("Secure; HttpOnly");
    expect(trust).not.toContain("Domain=");
  });

  it("uses the reviewed WebAuthn library with user verification and no Verus dependency", async () => {
    const manifest = JSON.parse(await readFile("packages/auth/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    const passkey = await readFile("packages/auth/src/passkey.ts", "utf8");
    expect(manifest.dependencies).toEqual({ "@simplewebauthn/server": "13.3.2" });
    expect(passkey).toContain('userVerification: "required"');
    expect(passkey).toContain("requireUserVerification: true");
    expect(passkey).not.toMatch(/verus|wallet|seed|privateKey/i);
  });

  it("keeps every optional consent separate and explicit", async () => {
    const consent = await readFile("packages/auth/src/consent.ts", "utf8");
    expect(consent).toContain("preselected");
    expect(consent).toContain("bundledPurposes.length !== 1");
    expect(consent).toContain("optional_verus_link");
    expect(consent).toContain("optional_public_identity_proof");
    expect(consent).toContain("relying_party_disclosure");
  });

  it("documents non-smartphone paths without claiming a live user interface", async () => {
    const accessibility = await readFile("docs/AUTHENTICATION_ACCESSIBILITY.md", "utf8");
    expect(accessibility).toContain("platform passkey");
    expect(accessibility).toContain("roaming security key");
    expect(accessibility).toContain("verified-email fallback");
    expect(accessibility).toContain("not an interface accessibility pass");
  });
});
