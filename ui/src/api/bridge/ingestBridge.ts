/**
 * VHS Studio Pro - Ingest, Probe, Disk Imaging & Signal QC IPC Bridge Facade (`api/bridge/ingestBridge.ts`).
 *
 * Re-exports decomposed bridges:
 * - `diskImagerBridge`: Direct hardware unbuffered raw block imaging
 * - `panasonicBridge`: Panasonic DMR / DVD-VR tree and chapter detection
 * - `probeBridge`: FFprobe media assessment, rational fps, metadata parsing
 * - `signalQcBridge`: Visual frame analysis, RF dropout scoring, audio conversions, capture triggers
 */

import { diskImagerBridge } from './diskImagerBridge';
import { panasonicBridge } from './panasonicBridge';
import { probeBridge } from './probeBridge';
import { signalQcBridge } from './signalQcBridge';

export { diskImagerBridge } from './diskImagerBridge';
export { panasonicBridge } from './panasonicBridge';
export { probeBridge } from './probeBridge';
export { signalQcBridge } from './signalQcBridge';

export const ingestBridge = {
  ...probeBridge,
  ...panasonicBridge,
  ...diskImagerBridge,
  ...signalQcBridge,
};
