/** Upstream's quicktest. Returns [coverage, uncovered?]. */
declare function autotester(
  sceneText: string,
  nav: unknown,
  sceneName: string,
  extraLabels?: string[],
): [number[], string[]?];
export default autotester;
