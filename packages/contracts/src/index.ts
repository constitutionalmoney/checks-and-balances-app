export const protocolStatus = Object.freeze({
  protocol: "Checks & Balances Protocol",
  stage: "specification",
  network: "VRSCTEST",
  operational: false,
  publicSessions: false,
  publicDirectory: false,
  banner: {
    eyebrow: "Specification",
    title: "VRSCTEST",
    message: "Not operational — no public verification sessions or live protocol services.",
  },
} as const);

export type ProtocolStatus = typeof protocolStatus;
