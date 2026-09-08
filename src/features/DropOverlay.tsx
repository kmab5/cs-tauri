/**
 * The whole window is the drop target.
 *
 * A 160px dashed box is a web page's answer, because a web page shares the
 * screen with everything else. An application window does not: if an archive
 * is dragged onto it, there is only one thing that can mean.
 *
 * Tauri's own drag-drop handling is switched off in tauri.conf.json
 * (`dragDropEnabled: false`), which is what lets these DOM events fire at all.
 */
import { useEffect, useState } from 'react';

import { importGame } from '@/lib/library';

export function DropOverlay({
  onImported,
  onBusy,
  onError,
}: {
  onImported: () => void;
  onBusy: (label: string | null) => void;
  onError: (message: string) => void;
}) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    /* dragenter and dragleave fire for every element crossed, so a depth
       counter is the only reliable way to know when the pointer has actually
       left the window. */
    let depth = 0;
    const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth += 1;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const over_ = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      onBusy(file.name);
      importGame(file)
        .then(onImported)
        .catch((err: Error) => onError(err.message))
        .finally(() => onBusy(null));
    };

    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over_);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over_);
      window.removeEventListener('drop', drop);
    };
  }, [onImported, onBusy, onError]);

  if (!over) return null;
  return (
    <div className="app-drop" aria-hidden>
      <div className="app-drop-frame">Drop to add this game</div>
    </div>
  );
}
