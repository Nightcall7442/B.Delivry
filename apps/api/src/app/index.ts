/**
 * App composition barrel.
 */
export { buildContainer } from './container.js';
export type { Container, BuildOptions } from './container.js';
export { createApp } from './create-app.js';
export { startServer } from './server.js';
export type { RunningServer } from './server.js';
export { registerShutdown } from './shutdown.js';
