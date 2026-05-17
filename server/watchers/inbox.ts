import chokidar from 'chokidar';
import { INBOX_PATH, INBOX_STATUS_PATH } from '../config.ts';
import { state } from '../state/engine.ts';
import { JsonlTail } from './jsonl-tail.ts';
import type { InboxEntry } from '../state/types.ts';

export async function startInboxWatcher(opts: { replayHistory?: boolean } = {}) {
  const tail = new JsonlTail();
  console.log(`[inbox] init — replayHistory=${opts.replayHistory}, file=${INBOX_PATH}`);

  if (opts.replayHistory) tail.seekToBeginning(INBOX_PATH);
  else await tail.seekToEnd(INBOX_PATH);

  const handle = async () => {
    try {
      const lines = await tail.readNew(INBOX_PATH);
      if (lines.length > 0) console.log(`[inbox] read ${lines.length} new line(s)`);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as InboxEntry;
          state.onInboxEntry(entry);
        } catch (e) {
          console.warn('[inbox] failed to parse line:', line.slice(0, 80));
        }
      }
    } catch (err) {
      console.warn(`[inbox] handle error:`, err);
    }
  };

  // Initial pass
  await handle();

  const watcher = chokidar.watch([INBOX_PATH, INBOX_STATUS_PATH], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });
  watcher.on('add', (path) => { console.log(`[inbox] file discovered: ${path}`); handle(); });
  watcher.on('change', (path) => { console.log(`[inbox] file changed: ${path}`); handle(); });
  watcher.on('error', (err) => console.warn('[inbox] watcher error:', err));

  console.log(`[inbox] watching ${INBOX_PATH}`);
  return () => watcher.close();
}