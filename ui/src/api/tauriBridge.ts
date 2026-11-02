/**
 * VHS Studio Pro - Typed Tauri v2 IPC Bridge Facade (`api/tauriBridge.ts`).
 *
 * Preserves 100% backward compatibility for all existing UI components and test suites
 * while delegating all modular domain bridges to `api/bridge/*` and environment
 * detection to `api/runtimeEnv.ts`.
 */

export * from './runtimeEnv';
export * from './bridge';
export { tauriBridge as default } from './bridge';
