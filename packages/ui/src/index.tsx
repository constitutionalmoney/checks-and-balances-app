import { protocolStatus } from "@cbc/contracts";
import type { ReactNode } from "react";

export interface ApplicationShellProps {
  readonly title: string;
  readonly purpose: string;
  readonly children?: ReactNode;
}

export function StatusBanner(): ReactNode {
  return (
    <section className="status-banner" aria-label="Protocol release status" role="status">
      <p className="status-banner__eyebrow">{protocolStatus.banner.eyebrow}</p>
      <strong>{protocolStatus.banner.title}</strong>
      <p>{protocolStatus.banner.message}</p>
    </section>
  );
}

export function ApplicationShell({ title, purpose, children }: ApplicationShellProps): ReactNode {
  return (
    <main className="app-shell">
      <StatusBanner />
      <section className="app-shell__content" aria-labelledby="page-title">
        <p className="app-shell__kicker">Checks &amp; Balances Protocol</p>
        <h1 id="page-title">{title}</h1>
        <p>{purpose}</p>
        <div className="app-shell__notice">
          This shell contains no accounts, participant data, committee actions, uploads, wallet
          requests, Verus writes, or live protocol behaviour.
        </div>
        {children}
      </section>
    </main>
  );
}
