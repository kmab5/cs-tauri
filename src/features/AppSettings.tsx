/**
 * Settings, with no game open.
 *
 * A thin dialog around the shared form — which is the point: the library and a
 * running game show the same settings, and the form decides which rows need an
 * engine.
 */
import { DialogPanel } from '@/components/ui/dialog';
import { SettingsForm } from './SettingsForm';

export function AppSettings({ onClose }: { onClose: () => void }) {
  return (
    <DialogPanel open title="Settings" onOpenChange={(v) => !v && onClose()}>
      <SettingsForm />
    </DialogPanel>
  );
}
