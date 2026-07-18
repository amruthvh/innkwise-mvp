export type TimingEntry = {
  name: string;
  ms: number;
  sinceStartMs: number;
  metadata?: Record<string, unknown>;
};

export type TimingSnapshot = {
  label: string;
  totalMs: number;
  entries: TimingEntry[];
};

export class TimingTracker {
  private readonly startedAt = Date.now();
  private readonly entries: TimingEntry[] = [];

  constructor(private readonly label: string) {}

  async time<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      this.add(name, Date.now() - startedAt, metadata);
    }
  }

  timeSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const startedAt = Date.now();
    try {
      return fn();
    } finally {
      this.add(name, Date.now() - startedAt, metadata);
    }
  }

  mark(name: string, metadata?: Record<string, unknown>) {
    this.add(name, 0, metadata);
  }

  snapshot(): TimingSnapshot {
    return {
      label: this.label,
      totalMs: Date.now() - this.startedAt,
      entries: [...this.entries]
    };
  }

  log(metadata?: Record<string, unknown>) {
    const snapshot = this.snapshot();
    console.info(`[timing] ${this.label} ${JSON.stringify({
      totalMs: snapshot.totalMs,
      entries: snapshot.entries,
      ...(metadata ?? {})
    })}`);
  }

  private add(name: string, ms: number, metadata?: Record<string, unknown>) {
    this.entries.push({
      name,
      ms,
      sinceStartMs: Date.now() - this.startedAt,
      ...(metadata ? { metadata } : {})
    });
  }
}
