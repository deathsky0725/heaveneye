import { open, stat } from 'node:fs/promises';

/** Tracks read position per file so we only parse newly-appended lines. */
export class JsonlTail {
  private positions = new Map<string, number>();

  /** Mark this file's current end as the "start" — historical lines won't replay. */
  async seekToEnd(path: string): Promise<void> {
    try {
      const s = await stat(path);
      this.positions.set(path, s.size);
    } catch {
      this.positions.set(path, 0);
    }
  }

  /** Mark this file's current beginning — replay everything from start. */
  seekToBeginning(path: string): void {
    this.positions.set(path, 0);
  }

  /** Read any lines appended since the last call (or since seek). */
  async readNew(path: string): Promise<string[]> {
    let s;
    try { s = await stat(path); } catch { return []; }
    const last = this.positions.get(path) ?? 0;
    if (s.size <= last) {
      // file may have been truncated — reset
      if (s.size < last) this.positions.set(path, s.size);
      return [];
    }
    const len = s.size - last;
    const buf = Buffer.alloc(len);
    const fh = await open(path, 'r');
    try {
      await fh.read(buf, 0, len, last);
    } finally {
      await fh.close();
    }
    this.positions.set(path, s.size);
    return buf.toString('utf8').split('\n').filter((l) => l.trim().length > 0);
  }
}
