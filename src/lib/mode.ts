/**
 * Which kind of app this is.
 *
 * A standalone build — one produced by `npm run cs:export` — ships exactly one
 * game and has no library: no shelf, no importing, no way back to a list that
 * does not exist. A library build is the normal app.
 *
 * The distinction is a resource file the builder writes, read once at boot,
 * rather than a compile-time constant. Same binary, same bundle, one fact
 * looked up — which also means the test harness can mock it and both modes are
 * testable from one build.
 */
import { invoke } from '@tauri-apps/api/core';

export interface AppMode {
  standalone: boolean;
  title?: string;
  author?: string;
}

const LIBRARY: AppMode = { standalone: false };

let cached: Promise<AppMode> | null = null;

export function loadMode(): Promise<AppMode> {
  cached ??= invoke<AppMode>('app_mode').catch(() => LIBRARY);
  return cached;
}
