/**
 * VHS Studio Pro - Modular Tauri IPC Bridge Hub (`api/bridge/index.ts`).
 */

import { ingestBridge } from './ingestBridge';
import { restorationBridge } from './restorationBridge';
import { storageBridge } from './storageBridge';
import { systemBridge } from './systemBridge';

export * from './types';
export * from './systemBridge';
export * from './restorationBridge';
export * from './ingestBridge';
export * from './storageBridge';

export const tauriBridge = {
  ...systemBridge,
  ...restorationBridge,
  ...ingestBridge,
  ...storageBridge,
};
