export const CBC_VRSCTEST_NAMESPACE = {
  network: "VRSCTEST",
  chainId: "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq",
  ownerFullyQualifiedName: "cbc-protocol-test.VRSCTEST@",
  ownerIdentityAddress: "iC7jT1JAJJZHrS4JnHRbgLn9qUQokMsedM",
  keys: {
    attestationHuman: {
      uri: "cbc-protocol-test.VRSCTEST::v1.attestation.human",
      vdxfId: "iKc5RdXteW91Y6uA3ZgpAprj5AJNi9b6Qw",
    },
    attestationMethod: {
      uri: "cbc-protocol-test.VRSCTEST::v1.attestation.method",
      vdxfId: "iMrUsgo1KmHw2XWRJA6dnm4Jo6pMo1Y2uY",
    },
    attestationValidity: {
      uri: "cbc-protocol-test.VRSCTEST::v1.attestation.validity",
      vdxfId: "i5XNjdxAUte6s3hxb4uD93NtwDFepzhUYr",
    },
    attestationRevocation: {
      uri: "cbc-protocol-test.VRSCTEST::v1.attestation.revocation",
      vdxfId: "i7WdcHsfhE8w39CW4F4N7H1UyU79nVuyti",
    },
    attestationPolicy: {
      uri: "cbc-protocol-test.VRSCTEST::v1.attestation.policy",
      vdxfId: "iH917hB9sQsgxFzJDBhew2PptxtPHCN8tA",
    },
    proofReference: {
      uri: "cbc-protocol-test.VRSCTEST::v1.proof.reference",
      vdxfId: "iPjXTdaVYCEJnkyh2qThXGZB54UpV2cy9F",
    },
    anchorSchema: {
      uri: "cbc-protocol-test.VRSCTEST::v1.anchor.schema",
      vdxfId: "iQxTRgN4ZaYQcWAspPfsNS5YFHTEahLgEP",
    },
    anchorPolicy: {
      uri: "cbc-protocol-test.VRSCTEST::v1.anchor.policy",
      vdxfId: "iQ5w3DRVthprX1NriFaSbKumMUpe9nyUAX",
    },
    anchorCycleReport: {
      uri: "cbc-protocol-test.VRSCTEST::v1.anchor.cycle_report",
      vdxfId: "iJLfbKwekbK8PoNCmDjJr7dXdcFL82ygRC",
    },
  },
} as const;

export const CBC_ANCHOR_MANIFEST_V1_POLICY = {
  policyReference: "cbc.anchor.manifest.v1",
  allowedTopLevelFields: [
    "schema",
    "environment",
    "anchorType",
    "artifact",
    "namespace",
    "supersedes",
  ],
  requiredTopLevelFields: [
    "schema",
    "environment",
    "anchorType",
    "artifact",
    "namespace",
    "supersedes",
  ],
  maximumBytes: 2_048,
} as const;
