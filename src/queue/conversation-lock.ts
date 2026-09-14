export class ConversationLock {
  private readonly active = new Set<string>();
  private readonly waiters = new Map<string, Array<() => void>>();

  async runExclusive<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(conversationId);
    try {
      return await fn();
    } finally {
      this.release(conversationId);
    }
  }

  private acquire(conversationId: string): Promise<void> {
    if (!this.active.has(conversationId)) {
      this.active.add(conversationId);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const queue = this.waiters.get(conversationId) ?? [];
      queue.push(resolve);
      this.waiters.set(conversationId, queue);
    });
  }

  private release(conversationId: string): void {
    const queue = this.waiters.get(conversationId);
    const next = queue?.shift();
    if (next) {
      next();
      return;
    }
    this.active.delete(conversationId);
    this.waiters.delete(conversationId);
  }
}
