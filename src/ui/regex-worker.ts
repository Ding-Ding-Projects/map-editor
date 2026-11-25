// Runs every regular expression the app evaluates, off the main thread. The page kills and
// replaces this worker when a run takes too long, so a catastrophic pattern cannot freeze it.
import { evaluate, type RegexRequest } from './regex-core.js';

self.onmessage = (e: MessageEvent<RegexRequest & { id: number }>) => {
  const { id, ...req } = e.data;
  (self as unknown as Worker).postMessage({ id, ...evaluate(req) });
};
