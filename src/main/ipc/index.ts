import type { Orchestrator } from '../services/orchestrator';
import { registerScannerHandlers } from './scanner.handler';
import { registerPacketHandlers } from './packet.handler';
import { registerOsHandlers } from './os.handler';

interface Services {
  orchestrator: Orchestrator;
}

export function registerAllHandlers({ orchestrator }: Services): void {
  registerScannerHandlers(orchestrator);
  registerPacketHandlers(orchestrator);
  registerOsHandlers(orchestrator);
}
