/**
 * @module write-queue
 * Generic serial write-queue to prevent read-modify-write races on
 * chrome.storage.local. Each queue ensures that async operations sharing
 * the same queue instance execute sequentially (next starts only after
 * previous resolves/rejects).
 */

export type WriteQueue = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Create a new independent write queue.
 * Usage: `const queue = createWriteQueue(); queue(() => myAsyncWrite());`
 */
export function createWriteQueue(): WriteQueue {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const queued = tail.then(() => fn());
    // Swallow rejection so the chain never breaks; the caller
    // of enqueue() still gets the real result/rejection.
    tail = queued.then(
      () => {},
      () => {},
    );
    return queued;
  };
}
