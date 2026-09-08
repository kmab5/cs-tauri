/**
 * What the storage layer stores.
 *
 * Games live as files under the OS application data directory; `db.ts` is the
 * only thing that talks to them. These types are the shape everything above it
 * sees.
 */

export interface StoredGame {
  id: string;
  title: string;
  author: string;
  scenes: string[];
  assets: string[];
  skipped: string[];
  sceneList: string[];
  achievements: [string, boolean, number, string, string, string][];
  source: string;
  uploadedAt: string;
  bytes: number;
}

/**
 * What Rust reports after unpacking an archive, before any ChoiceScript
 * parsing. The files are already on disk; this is the listing plus the raw
 * startup.txt that `library.ts` still has to read.
 */
export interface Ingested {
  id: string;
  scenes: string[];
  assets: string[];
  skipped: string[];
  startup: string;
  bytes: number;
  source: string;
}
