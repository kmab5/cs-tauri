/**
 * The standalone builder, from inside the app.
 *
 * Development instances only. `import.meta.env.DEV` is a compile-time constant,
 * so in a production build every call below is unreachable and the bundler
 * removes this module and the dialog that uses it outright — the strings do not
 * appear in `dist/`, which the webview harness checks.
 *
 * The Rust side refuses independently in a release build. Two gates for one
 * feature is deliberate: this one spawns a process against a path that only
 * exists in a checkout.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** True under `npm run dev` and `npm run tauri:dev`, false in any build. */
export const isDev = (): boolean => import.meta.env.DEV;

export interface DevInfo {
  available: boolean;
  repo?: string;
  platform: string;
  /** NSIS and MSI are Windows-only; Tauri cannot cross-compile them. */
  installers: boolean;
}

export interface BuildRequest {
  id: string;
  out: string;
  portable: boolean;
  nsis: boolean;
  msi: boolean;
  icon: boolean;
  skipTests: boolean;
  name: string;
  version: string;
  identifier: string;
}

export async function devInfo(): Promise<DevInfo> {
  if (!isDev()) return { available: false, platform: 'unknown', installers: false };
  try {
    return await invoke<DevInfo>('dev_info');
  } catch {
    return { available: false, platform: 'unknown', installers: false };
  }
}

export function buildStandalone(request: BuildRequest): Promise<void> {
  return invoke('build_standalone', { request });
}

/** Every line the CLI prints, in order, plus a final pass/fail. */
export function onBuildOutput(onLine: (line: string) => void, onDone: (ok: boolean) => void) {
  const subs = [
    listen<string>('build-log', (e) => onLine(e.payload)),
    listen<boolean>('build-done', (e) => onDone(e.payload)),
  ];
  return () => {
    for (const sub of subs) void sub.then((off) => off());
  };
}
