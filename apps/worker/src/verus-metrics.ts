export type VerusJobOutcome = "verified" | "retryable_failed" | "terminal_failed" | "dead_letter";

const HELP: Readonly<Record<string, string>> = {
  cbc_verus_outbox_ready: "Durable Verus outbox events ready for work.",
  cbc_verus_outbox_oldest_age_seconds: "Age of the oldest ready Verus outbox event.",
  cbc_verus_jobs_total: "Completed Verus worker outcomes.",
  cbc_verus_rpc_failures_total: "Classified Verus integration failures.",
  cbc_verus_node_synchronized: "Whether the last Verus preflight observed a synchronized node.",
  cbc_verus_wrong_network_total: "Verus preflight wrong-network rejections.",
  cbc_verus_confirmation_count: "Confirmations observed for the current transaction.",
  cbc_verus_readback_mismatch_total: "Exact readback digest mismatches.",
  cbc_verus_reorg_total: "Detected Verus transaction reorganizations.",
  cbc_verus_worker_paused: "Whether Verus writes are administratively paused.",
};

export class VerusWorkerMetrics {
  private ready = 0;
  private oldestAgeSeconds = 0;
  private synchronized = 0;
  private confirmationCount = 0;
  private paused = 1;
  private wrongNetwork = 0;
  private mismatch = 0;
  private reorg = 0;
  private readonly outcomes = new Map<VerusJobOutcome, number>();
  private readonly failures = new Map<string, number>();

  setQueue(ready: number, oldestAgeSeconds: number): void {
    this.ready = finiteNonnegative(ready);
    this.oldestAgeSeconds = finiteNonnegative(oldestAgeSeconds);
  }

  setNodeSynchronized(value: boolean): void {
    this.synchronized = value ? 1 : 0;
  }

  setConfirmationCount(value: number): void {
    this.confirmationCount = finiteNonnegative(value);
  }

  setPaused(value: boolean): void {
    this.paused = value ? 1 : 0;
  }

  recordOutcome(value: VerusJobOutcome): void {
    this.outcomes.set(value, (this.outcomes.get(value) ?? 0) + 1);
  }

  recordFailure(errorClass: string): void {
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(errorClass)) return;
    this.failures.set(errorClass, (this.failures.get(errorClass) ?? 0) + 1);
  }

  recordWrongNetwork(): void {
    this.wrongNetwork += 1;
  }

  recordReadbackMismatch(): void {
    this.mismatch += 1;
  }

  recordReorg(): void {
    this.reorg += 1;
  }

  render(): string {
    const lines: string[] = [];
    const gauge = (name: keyof typeof HELP, value: number) => {
      lines.push(`# HELP ${name} ${HELP[name]}`, `# TYPE ${name} gauge`, `${name} ${value}`);
    };
    const counter = (name: keyof typeof HELP, value: number) => {
      lines.push(`# HELP ${name} ${HELP[name]}`, `# TYPE ${name} counter`, `${name} ${value}`);
    };
    gauge("cbc_verus_outbox_ready", this.ready);
    gauge("cbc_verus_outbox_oldest_age_seconds", this.oldestAgeSeconds);
    lines.push(
      `# HELP cbc_verus_jobs_total ${HELP.cbc_verus_jobs_total}`,
      "# TYPE cbc_verus_jobs_total counter",
    );
    for (const outcome of [
      "verified",
      "retryable_failed",
      "terminal_failed",
      "dead_letter",
    ] as const) {
      lines.push(`cbc_verus_jobs_total{outcome="${outcome}"} ${this.outcomes.get(outcome) ?? 0}`);
    }
    lines.push(
      `# HELP cbc_verus_rpc_failures_total ${HELP.cbc_verus_rpc_failures_total}`,
      "# TYPE cbc_verus_rpc_failures_total counter",
    );
    for (const errorClass of [...this.failures.keys()].sort()) {
      lines.push(
        `cbc_verus_rpc_failures_total{class="${errorClass}"} ${this.failures.get(errorClass)}`,
      );
    }
    gauge("cbc_verus_node_synchronized", this.synchronized);
    counter("cbc_verus_wrong_network_total", this.wrongNetwork);
    gauge("cbc_verus_confirmation_count", this.confirmationCount);
    counter("cbc_verus_readback_mismatch_total", this.mismatch);
    counter("cbc_verus_reorg_total", this.reorg);
    gauge("cbc_verus_worker_paused", this.paused);
    return `${lines.join("\n")}\n`;
  }
}

function finiteNonnegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
