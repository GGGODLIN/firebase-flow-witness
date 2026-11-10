'use client';

import type { TransitionPair } from '../lib/verification-pipeline.ts';
import { cx, Eyebrow } from './ui.tsx';

interface ScenarioMeta {
  readonly id: string;
  readonly kicker: string;
  readonly tone: string;
}

// What each hero proves in the storyboard; titles come from the engine data.
const HERO_META: readonly ScenarioMeta[] = [
  { id: 'H1', kicker: 'false green · persistence lie', tone: 'text-rose-300' },
  { id: 'H2', kicker: 'layout / token break', tone: 'text-orange-300' },
  { id: 'H3', kicker: 'benign noise · melts on-device', tone: 'text-emerald-300' },
  { id: 'H4', kicker: 'unsure → cloud escalation', tone: 'text-amber-300' },
];

interface ScenarioTabsProps {
  readonly pairs: readonly TransitionPair[];
  readonly selectedId: string;
  readonly disabled: boolean;
  readonly onSelect: (scenarioId: string) => void;
}

export function ScenarioTabs({ pairs, selectedId, disabled, onSelect }: ScenarioTabsProps) {
  return (
    <div role="group" aria-label="Hero scenarios" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {pairs.map((pair) => {
        const meta = HERO_META.find((entry) => entry.id === pair.id);
        const selected = pair.id === selectedId;
        return (
          <button
            key={pair.id}
            type="button"
            data-testid={`scenario-tab-${pair.id}`}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onSelect(pair.id)}
            className={cx(
              'group relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-amber-300/60 bg-amber-300/[0.08] shadow-[0_0_0_1px_rgba(252,211,77,0.15),0_18px_40px_-24px_rgba(245,158,11,0.6)]'
                : 'border-white/[0.07] bg-slate-900/50 hover:border-white/20 hover:bg-slate-900/80',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cx(
                  'grid h-6 min-w-6 place-items-center rounded-md border px-1 font-mono text-[11px] font-bold',
                  selected ? 'border-amber-300/70 text-amber-200' : 'border-white/15 text-slate-400',
                )}
              >
                {pair.id}
              </span>
              <Eyebrow className={meta?.tone}>{meta?.kicker ?? 'scenario'}</Eyebrow>
            </span>
            <span className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-100">{pair.title}</span>
          </button>
        );
      })}
    </div>
  );
}
