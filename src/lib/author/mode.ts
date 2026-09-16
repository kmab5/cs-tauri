/**
 * Author mode.
 *
 * Two ways in, because there are two kinds of build:
 *
 *  - The library app has it as a **setting**. One person's player is another
 *    person's authoring tool, and the same install is both.
 *  - A standalone app has it **baked in** by `cs:export --author`. An exported
 *    story is either a release build or a testing build, and which one it is
 *    was decided when it was built — a reader should not be able to switch a
 *    published story into god mode from a settings panel.
 *
 * So the baked flag wins when it is present, and the setting is what decides
 * otherwise.
 */
const KEY = 'cs-author-mode';

let baked: boolean | null = null;

/** Called once at boot with what the build itself says. */
export function setBakedAuthorMode(value: boolean | undefined) {
  baked = value ?? null;
}

export function isAuthorMode(): boolean {
  if (baked !== null) return baked;
  return localStorage.getItem(KEY) === '1';
}

/** True when the reader is allowed to change it — i.e. not a baked build. */
export const canToggleAuthorMode = () => baked === null;

export function setAuthorMode(on: boolean) {
  if (!canToggleAuthorMode()) return;
  if (on) localStorage.setItem(KEY, '1');
  else localStorage.removeItem(KEY);
}
