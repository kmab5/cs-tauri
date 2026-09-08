/**
 * The storage contract, shared by both backends.
 *
 * `db.web.ts` keeps games in IndexedDB, which is what the static site has
 * always done. `db.tauri.ts` keeps them as files on disk. `db.ts` picks one at
 * runtime. Nothing above this line knows which it is talking to.
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
 * The result of unpacking an archive, before any ChoiceScript parsing.
 *
 * On the web the files are unpacked in the browser and travel in `payload`,
 * waiting to be committed. On the desktop Rust has already written them to
 * disk and there is no payload — only the listing and the raw startup.txt that
 * `library.ts` still has to parse.
 */
export interface Ingested {
  id: string;
  scenes: string[];
  assets: string[];
  skipped: string[];
  startup: string;
  bytes: number;
  source: string;
  payload?: {
    scenes: Record<string, string>;
    assets: Record<string, Blob>;
  };
}

export interface Backend {
  /** Record a finished import. Web writes the payload; desktop writes a manifest. */
  commit(game: StoredGame, ingested: Ingested): Promise<void>;
  listGames(): Promise<StoredGame[]>;
  getGame(id: string): Promise<StoredGame | undefined>;
  getScenes(id: string): Promise<Record<string, string>>;
  /**
   * Asset name to a URL an `<img src>` can use.
   *
   * Web returns object URLs, which the caller must revoke. Desktop returns
   * asset-protocol URLs, which it must not: they are paths, not handles, and
   * revoking one does nothing while reading 66 images across IPC to make
   * blobs instead would cost a visible pause on every game open.
   */
  getAssetUrls(id: string): Promise<Record<string, string>>;
  deleteGame(id: string): Promise<void>;
  quota(): Promise<{ usage: number; quota: number } | null>;
  requestPersistence(): Promise<boolean>;
}
