/**
 * Simple async lock implementation for synchronizing access to shared resources
 */
class AsyncLock {
  private locked: boolean = false;
  private waitingQueue: Array<() => void> = [];

  /**
   * Acquires the lock.
   *
   * @returns A promise that resolves with a release function.
   */
  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this.waitingQueue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  /**
   * Releases the lock and notifies the next waiting function if available.
   */
  private release(): void {
    if (this.waitingQueue.length > 0) {
      const next = this.waitingQueue.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }
}

export default AsyncLock;
