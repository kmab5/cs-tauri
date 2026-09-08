/**
 * Two things the app assumes about a browser that a webview may not provide.
 *
 * Both are feature-detected, so a current WebView2 or WKWebView uses its own
 * native implementation and none of this runs.
 */
import { invoke } from '@tauri-apps/api/core';

/**
 * `crypto.randomUUID` is exposed only in a secure context. Tauri's custom
 * protocol is treated as one on some platform and webview combinations and not
 * others, and `library.ts` calls it for every game id — so on a bad
 * combination importing a game throws before it starts.
 *
 * `getRandomValues` has no such restriction. This is the standard v4 layout.
 */
function installRandomUUID() {
  if (typeof crypto.randomUUID === 'function') return;
  const uuid = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20,
    )}-${hex.slice(20)}`;
  };
  Object.defineProperty(crypto, 'randomUUID', {
    value: uuid as unknown as Crypto['randomUUID'],
    configurable: true,
    writable: true,
  });
}

/**
 * `DecompressionStream` is how `archive.ts` reads zip entries with no
 * dependency. WebKitGTK gained it in 2.40; older Linux distributions ship less
 * than that, and there the whole import path fails with a ReferenceError.
 *
 * The fallback buffers the stream and hands it to Rust in one call. Not
 * streaming, deliberately: game archives are a few megabytes and arrive as a
 * single file anyway, so incremental output would buy nothing and cost an IPC
 * round trip per chunk.
 */
function installDecompressionStream() {
  if ('DecompressionStream' in globalThis) return;

  class BufferedDecompressionStream {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;

    constructor(format: string) {
      const chunks: Uint8Array[] = [];
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk) {
          chunks.push(chunk);
        },
        async flush(controller) {
          const total = chunks.reduce((n, c) => n + c.byteLength, 0);
          const joined = new Uint8Array(total);
          let at = 0;
          for (const chunk of chunks) {
            joined.set(chunk, at);
            at += chunk.byteLength;
          }
          const out = await invoke<ArrayBuffer>('decompress', joined, {
            headers: { format },
          });
          controller.enqueue(new Uint8Array(out));
        },
      });
      this.readable = readable;
      this.writable = writable;
    }
  }

  Object.defineProperty(globalThis, 'DecompressionStream', {
    value: BufferedDecompressionStream,
    configurable: true,
    writable: true,
  });
}

export function installPolyfills() {
  installRandomUUID();
  installDecompressionStream();
}
