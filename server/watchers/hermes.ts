import chokidar from 'chokidar';
import { HERMES_STATUS_PATH } from '../config.ts';
import { state } from '../state/engine.ts';
import { JsonlTail } from './jsonl-tail.ts';

interface HermesEvent {
  ts: string;
  agent: string;
  task_id: string;
  event: string;
  payload?: any;
}

export async function startHermesWatcher(opts: { replayHistory?: boolean } = {}) {
  const tail = new JsonlTail();
  console.log(`[hermes] init — replayHistory=${opts.replayHistory}, file=${HERMES_STATUS_PATH}`);

  if (opts.replayHistory) tail.seekToBeginning(HERMES_STATUS_PATH);
  else await tail.seekToEnd(HERMES_STATUS_PATH);

  const handle = async () => {
    try {
      const lines = await tail.readNew(HERMES_STATUS_PATH);
      if (lines.length > 0) console.log(`[hermes] read ${lines.length} new line(s)`);
      for (const line of lines) {
        try {
          const ev = JSON.parse(line) as HermesEvent;
          state.onHermesEvent(ev);
        } catch (e) {
          console.warn('[hermes] failed to parse line:', line.slice(0, 80));
        }
      }
    } catch (err) {
      console.warn(`[hermes] handle error:`, err);
    }
  };

  // Initial pass (in case replayHistory is true, drain everything now)
  await handle();

  const watcher = chokidar.watch(HERMES_STATUS_PATH, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });
  watcher.on('add', (path) => { console.log(`[hermes] file discovered: ${path}`); handle(); });
  watcher.on('change', (path) => { console.log(`[hermes] file changed: ${path}`); handle(); });
  watcher.on('error', (err) => console.warn('[hermes] watcher error:', err));

  console.log(`[hermes] watching ${HERMES_STATUS_PATH}`);
  return () => watcher.close();
}
