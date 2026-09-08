/**
 * Answering the engine.
 *
 * State says what the engine is waiting for; we answer with a verb
 * (`cs.chooseGroups`, `cs.next`, `cs.submitInput`) rather than calling a
 * callback handed to us in state. That is what keeps state serialisable.
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ChoiceOption, ChoiceScriptApi, Channel, Pending } from '@/lib/choicescript';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Select-then-confirm, deliberately. A choice in interactive fiction is a
 * decision, and a mis-tap that silently branches the story is far worse than
 * one extra tap. Native radios also carry the screen-reader semantics.
 */
function Choice({
  pending,
  onAnswer,
}: {
  pending: Extract<Pending, { kind: 'choice' }>;
  onAnswer: (path: number[]) => void;
}) {
  const spring = { type: 'spring', stiffness: 500, damping: 32 } as const;
  const groups = pending.groups.length ? pending.groups : [''];
  const [selected, setSelected] = useState<Record<number, number | null>>({});
  const [error, setError] = useState<string | null>(null);

  const optionsFor = useCallback(
    (depth: number): ChoiceOption[] | null => {
      let opts: ChoiceOption[] | undefined = pending.options;
      for (let i = 0; i < depth; i++) {
        const chosen = selected[i];
        if (chosen === null || chosen === undefined) return null;
        opts = opts?.[chosen]?.suboptions;
        if (!opts) return null;
      }
      return opts ?? null;
    },
    [pending.options, selected],
  );

  /* number keys 1-9, matching the shortcuts the engine assigns */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (/^(INPUT|TEXTAREA)$/.test(tag)) return;
      const n = parseInt(e.key, 10);
      const opts = optionsFor(groups.length - 1);
      if (!opts || Number.isNaN(n) || n < 1 || n > opts.length) return;
      if (opts[n - 1].unselectable) return;
      setSelected((prev) => ({ ...prev, [groups.length - 1]: n - 1 }));
      setError(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [groups.length, optionsFor]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const path: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const v = selected[i];
      if (v === null || v === undefined) {
        setError(groups[i] ? `Choose a ${groups[i]} first.` : 'Choose one of the options first.');
        return;
      }
      path.push(v);
    }
    setError(null);
    onAnswer(path);
  }

  const ready = groups.every((_, i) => selected[i] !== null && selected[i] !== undefined);

  return (
    <form className="mt-10" onSubmit={submit}>
      {groups.map((group, depth) => {
        const opts = optionsFor(depth);
        if (!opts) return null;
        return (
          <fieldset key={depth} className="mb-4 border-0 p-0">
            {group && (
              <legend className="pb-3 font-ui text-sm uppercase tracking-wider text-ink-faint">
                Select {group}
              </legend>
            )}
            <div className="flex flex-col gap-2">
              {opts.map((option, i) => {
                const id = `opt-${depth}-${i}`;
                const checked = selected[depth] === i;
                return (
                  <div key={i} className="relative">
                    <input
                      type="radio"
                      id={id}
                      name={`group${depth}`}
                      className="peer sr-only"
                      disabled={option.unselectable}
                      checked={checked}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = { ...prev, [depth]: i };
                          for (let d = depth + 1; d < groups.length; d++) next[d] = null;
                          return next;
                        })
                      }
                    />
                    <motion.label
                      htmlFor={id}
                      whileTap={option.unselectable ? undefined : { scale: 0.985 }}
                      transition={spring}
                      className={cn(
                        'group relative flex min-h-touch cursor-pointer items-start gap-3',
                        'overflow-hidden rounded-cs border border-rule bg-raised py-3 pl-5 pr-4',
                        'transition-colors duration-200 hover:border-accent/60',
                        'peer-checked:border-accent peer-checked:bg-accent-wash',
                        'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                        option.unselectable &&
                          'cursor-not-allowed border-dashed bg-transparent text-ink-faint hover:border-rule',
                      )}
                    >
                      {/* the rail: fills on intent. An affordance, not decoration. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-y-0 left-0 w-[3px] origin-top bg-accent',
                          'transition-transform duration-200 ease-out',
                          checked ? 'scale-y-100' : 'scale-y-0',
                          !option.unselectable && !checked && 'group-hover:scale-y-100',
                        )}
                      />
                      {depth === groups.length - 1 && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'shrink-0 pt-0.5 font-ui text-sm tabular-nums transition-colors',
                            checked ? 'text-accent' : 'text-ink-faint',
                          )}
                        >
                          {i + 1}
                        </span>
                      )}
                      <span className="flex-1" dangerouslySetInnerHTML={{ __html: option.name }} />
                    </motion.label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-3 font-ui text-sm text-accent"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <motion.div whileTap={{ scale: 0.98 }} transition={spring} className="inline-block">
        <Button type="submit" variant={ready ? 'default' : 'outline'}>
          Next
        </Button>
      </motion.div>
    </form>
  );
}

function TextInput({
  pending,
  onAnswer,
}: {
  pending: Extract<Pending, { kind: 'input' }>;
  onAnswer: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-6 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value && !pending.allowBlank) return setError('Type something first.');
        onAnswer(value);
      }}
    >
      <label className="sr-only" htmlFor="cs-input">
        Your answer
      </label>
      <Input
        id="cs-input"
        autoFocus
        className="flex-1"
        type={pending.numeric ? 'number' : 'text'}
        min={pending.minimum}
        max={pending.maximum}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <Button type="submit" variant="default">
        Next
      </Button>
      {error && (
        <p role="alert" className="w-full font-ui text-sm text-accent">
          {error}
        </p>
      )}
    </form>
  );
}

export function PendingView({
  pending,
  cs,
  channel,
}: {
  pending: Pending | null;
  cs: ChoiceScriptApi;
  channel?: Channel;
}) {
  if (!pending) return null;

  if (pending.kind === 'next') {
    return (
      <div className="mt-10">
        <motion.div
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className="inline-block"
        >
          <Button variant="default" onClick={() => cs.next(channel)}>
            {pending.name || 'Next'}
          </Button>
        </motion.div>
      </div>
    );
  }
  if (pending.kind === 'choice') {
    return <Choice pending={pending} onAnswer={(path) => cs.chooseGroups(path, channel)} />;
  }
  if (pending.kind === 'input') {
    return <TextInput pending={pending} onAnswer={(v) => cs.submitInput(v, channel)} />;
  }
  return null;
}
