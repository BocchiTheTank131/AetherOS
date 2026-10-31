// AetherOS - Aether Secure Runtime Entry Point
export * from './RuntimeLimits';
export * from './RuntimePermissions';
export * from './RuntimeErrors';
export * from './RuntimeProtocol';
export * from './RuntimeSession';
export * from './RuntimeManager';

import { runtimeManager } from './RuntimeManager';

export const aetherRuntime = runtimeManager;
