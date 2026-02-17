import type { Orchestrator } from '../services/orchestrator';
import { registerScannerHandlers } from './scanner.handler';

interface Services {
  orchestrator: Orchestrator;
}

export function registerAllHandlers({ orchestrator }: Services): void {
  registerScannerHandlers(orchestrator);
}
