/**
 * Rendering `state.blocks`.
 *
 * This file carries two of the five front-end obligations:
 *   - render blocks in order, as HTML (the engine already expanded bbcode)
 *   - mount `legacyNode` blocks, which is NOT optional
 */
import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import type { Block, ChoiceScriptApi, StatRow } from '@/lib/choicescript';
import { assetUrl } from '@/lib/library';
import { cn } from '@/lib/utils';

interface BlockProps {
  block: Block;
  cs: ChoiceScriptApi;
  gameId: string;
}

/**
 * Authored `*script` blocks append real DOM nodes, and state references them by
 * id. Mount the element at its position and let React leave its insides alone —
 * the wrapper has no React children, so nothing diffs inside it.
 *
 * Skip this and games that draw their own stat bars (Choice of Magic, for one)
 * silently lose them.
 */
function LegacyNode({ id, cs }: { id: string; cs: ChoiceScriptApi }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cs.getLegacyNode(id);
    if (host.current && el && el.parentNode !== host.current) {
      host.current.appendChild(el);
    }
  });
  return <div ref={host} className="contents" />;
}

function StatChart({ rows }: { rows: StatRow[] }) {
  return (
    <div className="my-4">
      {rows.map((row, i) => {
        if (row.type === 'text') {
          return (
            <div key={i} className="mb-4">
              <div className="mb-1 flex justify-between gap-3 font-ui text-[0.9375rem]">
                <span>{row.label}</span>
                <span className="text-ink-muted">{String(row.value)}</span>
              </div>
              {row.definition && (
                <p className="font-ui text-sm text-ink-muted">{row.definition}</p>
              )}
            </div>
          );
        }
        const opposed = row.type === 'opposed_pair';
        const pct = Math.max(0, Math.min(100, Number(row.value) || 0));
        return (
          <div key={i} className="mb-4">
            <div className="mb-1 flex justify-between gap-3 font-ui text-[0.9375rem]">
              <span>{row.label}</span>
              <span className="tabular-nums text-ink-muted">
                {opposed ? `${pct}% / ${100 - pct}% ${row.label2 ?? ''}` : `${pct}%`}
              </span>
            </div>
            <div
              role="meter"
              aria-label={opposed ? `${row.label} versus ${row.label2}` : row.label}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={
                opposed ? `${pct}% ${row.label}, ${100 - pct}% ${row.label2}` : `${pct}%`
              }
              className="h-2 overflow-hidden rounded-full bg-track"
            >
              {/* bars grow to their value: the number becomes legible as motion */}
              <motion.div
                className={cn('h-full rounded-full', opposed ? 'bg-fill-opposed' : 'bg-fill')}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            {row.definition && (
              <p className="mt-1 font-ui text-sm text-ink-muted">{row.definition}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BlockView({ block, cs, gameId }: BlockProps) {
  switch (block.kind) {
    case 'legacyNode':
      return <LegacyNode id={block.id} cs={cs} />;
    case 'linebreak':
      return <br />;
    case 'error':
      return (
        <p
          role="alert"
          className="my-4 rounded-cs border-l-[3px] border-accent bg-accent-wash px-4 py-3 font-ui text-[0.9375rem] text-accent"
        >
          {block.message}
        </p>
      );
    case 'image':
      return (
        <img
          src={assetUrl(gameId, block.source)}
          alt={block.alt}
          className={cn(
            'my-6 block h-auto max-w-full',
            block.alignment === 'center' && 'mx-auto',
            block.alignment === 'right' && 'ml-auto',
            block.invert && 'dark:invert',
          )}
        />
      );
    case 'youtube':
      return (
        <iframe
          className="my-6 aspect-video w-full"
          src={`https://www.youtube.com/embed/${block.slug}`}
          title="Video"
          allowFullScreen
        />
      );
    case 'link':
      return (
        <p>
          <a
            className="text-accent underline underline-offset-2"
            href={block.href}
            target="_blank"
            rel="noopener"
          >
            {block.anchorText}
          </a>
        </p>
      );
    case 'statchart':
      return <StatChart rows={block.rows} />;
    case 'text':
      return block.inline ? (
        <span dangerouslySetInnerHTML={{ __html: block.html }} />
      ) : (
        <p className="mb-4 last:mb-0" dangerouslySetInnerHTML={{ __html: block.html }} />
      );
    default:
      return null;
  }
}

/**
 * Note the container has NO id. The core owns `#text` — an offscreen host it
 * patches so authored `appendChild` calls are intercepted before the engine
 * writes anything. Claiming that id here would take it back and break the
 * interception.
 */
export function Blocks({
  blocks,
  cs,
  gameId,
  className,
}: {
  blocks: Block[];
  cs: ChoiceScriptApi;
  gameId: string;
  className?: string;
}) {
  return (
    <div className={cn('cs-text', className)}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} cs={cs} gameId={gameId} />
      ))}
    </div>
  );
}
