export interface BackoffConfig {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
}

export class ExponentialBackoff {
  private attempt = 0;

  constructor(private readonly config: BackoffConfig) {}

  hasNext(): boolean {
    return this.attempt < this.config.maxAttempts;
  }

  next(): number {
    if (!this.hasNext()) {
      throw new Error('ExponentialBackoff: max attempts reached');
    }
    const delay = Math.min(this.config.baseMs * 2 ** this.attempt, this.config.maxMs);
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }
}
