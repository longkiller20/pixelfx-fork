// A lock per key (per account): work for the same account runs one at a time, in order, however many requests and
// sockets arrive at once. This keeps two tabs or a double-tap from interleaving reads and writes of the same character.
// It covers one Node process; the database's own constraints and conditional updates cover everything else.

export class KeyedLock {
  constructor() {
    this.tails = new Map();
  }
  /** Run fn() once every earlier fn() for this key has finished; returns its result. */
  run(key, fn) {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => {});
    this.tails.set(key, tail);
    tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

export const userLock = new KeyedLock();
