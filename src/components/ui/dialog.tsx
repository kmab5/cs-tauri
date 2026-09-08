/**
 * Dialog.
 *
 * A calm, centred dialog that fades and settles rather than sliding up from the
 * edge of the screen. The easing is a long ease-out so it arrives quickly and
 * comes to rest gently — the motion should read as the panel already being
 * there, not as a drawer being pulled.
 *
 * Radix underneath, so focus trapping, Escape, scroll locking and aria-modal
 * come along unchanged.
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogClose = DialogPrimitive.Close;

interface PanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function DialogPanel({ open, onOpenChange, title, children }: PanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]',
            'data-[state=open]:animate-[cs-fade_200ms_cubic-bezier(0.16,1,0.3,1)]',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-40 w-[calc(100%-2rem)] max-w-[60ch]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex max-h-[85vh] flex-col overflow-hidden rounded-xl',
            'border border-rule bg-paper text-ink shadow-2xl outline-none',
            'data-[state=open]:animate-[cs-settle_220ms_cubic-bezier(0.16,1,0.3,1)]',
            'data-[state=closed]:animate-[cs-dismiss_140ms_ease-in]',
          )}
        >
          <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-rule px-5 py-4">
            <DialogPrimitive.Title className="font-ui text-[1.0625rem] font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-accent-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </header>
          <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

export { Dialog, DialogClose };
