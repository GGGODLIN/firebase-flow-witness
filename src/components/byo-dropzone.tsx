'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { getHeroScenarios } from '../core/flow-witness-engine.ts';
import { validateByoSnapshotInput } from '../core/studio-model.ts';
import {
  buildByoPair,
  readSnapshotFile,
  releaseSnapshotSlot,
  type SnapshotSlot,
} from '../lib/byo-snapshots.ts';
import type { RecordedVerdicts, TransitionPair } from '../lib/verification-pipeline.ts';
import { cx, Eyebrow } from './ui.tsx';

type SlotName = 'before' | 'after';

interface ByoDraft {
  readonly claim: string;
  readonly sourceSlice: string;
  readonly before: SnapshotSlot | null;
  readonly after: SnapshotSlot | null;
  // Only the built-in sample carries a patched render and recorded verdicts.
  readonly patched: CanvasImageSource | null;
  readonly recorded: RecordedVerdicts | null;
}

const EMPTY_DRAFT: ByoDraft = {
  claim: '',
  sourceSlice: '',
  before: null,
  after: null,
  patched: null,
  recorded: null,
};

function firstImageFile(files: FileList): File | null {
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      return file;
    }
  }
  return null;
}

interface SnapshotDropProps {
  readonly label: string;
  readonly snapshot: SnapshotSlot | null;
  readonly disabled: boolean;
  readonly onFile: (file: File) => void;
}

function SnapshotDrop({ label, snapshot, disabled, onFile }: SnapshotDropProps) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = firstImageFile(event.dataTransfer.files);
    if (file) {
      onFile(file);
    }
  };

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        'group relative flex min-h-44 cursor-pointer flex-col overflow-hidden rounded-xl border border-dashed transition focus-within:ring-2 focus-within:ring-cyan-300/70',
        dragging
          ? 'border-cyan-300 bg-cyan-400/10'
          : snapshot
            ? 'border-cyan-400/30 bg-slate-950/60'
            : 'border-white/15 bg-slate-950/40 hover:border-cyan-300/50',
      )}
    >
      <input
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFile(file);
          }
          event.target.value = '';
        }}
      />
      <span className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <Eyebrow className="text-cyan-200/80">{label}</Eyebrow>
        <span className="font-mono text-[10px] text-slate-500">
          {snapshot ? `${snapshot.width}×${snapshot.height} · ${snapshot.mimeType}` : 'PNG / JPEG'}
        </span>
      </span>
      {snapshot ? (
        <Image
          src={snapshot.previewUrl}
          alt={`${label} snapshot preview`}
          width={snapshot.width}
          height={snapshot.height}
          unoptimized
          className="h-auto w-full"
        />
      ) : (
        <span className="grid flex-1 place-items-center px-4 py-6 text-center text-xs leading-relaxed text-slate-500">
          Drop, paste or click to choose a screenshot
        </span>
      )}
      {snapshot ? (
        <span className="truncate border-t border-white/5 px-3 py-1 font-mono text-[10px] text-slate-500">
          {snapshot.name}
        </span>
      ) : null}
    </label>
  );
}

interface ByoDropzoneProps {
  readonly open: boolean;
  readonly interactive: boolean;
  readonly busy: boolean;
  readonly onToggle: () => void;
  readonly onRun: (pair: TransitionPair) => void;
}

export function ByoDropzone({ open, interactive, busy, onToggle, onRun }: ByoDropzoneProps) {
  const [draft, setDraft] = useState<ByoDraft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<string | null>(null);
  const slotSeqRef = useRef<{ before: number; after: number }>({ before: 0, after: 0 });
  const slotsRef = useRef<{ before: SnapshotSlot | null; after: SnapshotSlot | null }>({
    before: null,
    after: null,
  });

  useEffect(() => {
    const slots = slotsRef.current;
    return () => {
      releaseSnapshotSlot(slots.before);
      releaseSnapshotSlot(slots.after);
    };
  }, []);

  const validation = useMemo(
    () =>
      draft.before && draft.after
        ? validateByoSnapshotInput({
            beforeWidth: draft.before.width,
            beforeHeight: draft.before.height,
            beforeMimeType: draft.before.mimeType,
            afterWidth: draft.after.width,
            afterHeight: draft.after.height,
            afterMimeType: draft.after.mimeType,
            expectedClaim: draft.claim,
            sourceSlice: draft.sourceSlice,
          })
        : null,
    [draft],
  );

  const acceptFile = async (slot: SlotName, file: File) => {
    slotSeqRef.current[slot] += 1;
    const reqSeq = slotSeqRef.current[slot];
    setProblem(null);
    try {
      const snapshot = await readSnapshotFile(file);
      if (slotSeqRef.current[slot] !== reqSeq) {
        releaseSnapshotSlot(snapshot);
        return;
      }
      releaseSnapshotSlot(slotsRef.current[slot]);
      slotsRef.current[slot] = snapshot;
      // A user frame invalidates the sample's patched render and recorded verdicts.
      setDraft((current) => ({ ...current, [slot]: snapshot, patched: null, recorded: null }));
    } catch {
      if (slotSeqRef.current[slot] === reqSeq) {
        setProblem(`Could not decode ${file.name}. Drop a PNG or JPEG screenshot.`);
      }
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = firstImageFile(event.clipboardData.files);
    if (!file) {
      return;
    }
    event.preventDefault();
    void acceptFile(draft.before ? 'after' : 'before', file);
  };

  const loadSample = () => {
    slotSeqRef.current.before += 1;
    slotSeqRef.current.after += 1;
    const sampleScenario = getHeroScenarios()[1] ?? getHeroScenarios()[0]!;
    const toCanvasSlot = (rgba: Uint8ClampedArray, name: string): SnapshotSlot => {
      const canvas = document.createElement('canvas');
      canvas.width = sampleScenario.width;
      canvas.height = sampleScenario.height;
      const ctx = canvas.getContext('2d');
      ctx?.putImageData(
        new ImageData(new Uint8ClampedArray(rgba), sampleScenario.width, sampleScenario.height),
        0,
        0,
      );
      return {
        name,
        mimeType: 'image/png',
        width: sampleScenario.width,
        height: sampleScenario.height,
        source: canvas,
        previewUrl: canvas.toDataURL('image/png'),
        ownsPreviewUrl: false,
      };
    };
    const beforeSlot = toCanvasSlot(sampleScenario.beforeRgba, 'sample-before.png');
    const afterSlot = toCanvasSlot(sampleScenario.afterRgba, 'sample-after.png');
    releaseSnapshotSlot(slotsRef.current.before);
    releaseSnapshotSlot(slotsRef.current.after);
    slotsRef.current.before = beforeSlot;
    slotsRef.current.after = afterSlot;
    setProblem(null);
    setDraft((current) => ({
      claim: current.claim.trim().length > 0 ? current.claim : sampleScenario.expectedClaim,
      sourceSlice: sampleScenario.deterministicSourceSlice,
      before: beforeSlot,
      after: afterSlot,
      patched: beforeSlot.source,
      recorded: {
        triage: sampleScenario.defaultTriageVerdict,
        escalation: sampleScenario.defaultEscalationVerdict,
      },
    }));
  };

  const run = () => {
    if (!draft.before || !draft.after || !validation?.valid) {
      return;
    }
    try {
      const claim = draft.claim.trim();
      const pair = buildByoPair({
        title: draft.recorded ? 'BYO sample · pricing badge collision' : 'Bring Your Own Snapshot',
        claim,
        sourceSlice: validation.normalizedSourceSlice,
        before: draft.before,
        after: draft.after,
        patched: draft.patched ?? undefined,
        recorded: draft.recorded ?? undefined,
      });
      onRun(pair);
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : 'Could not rasterize the snapshots.');
    }
  };

  const canRun = interactive && !busy && validation?.valid === true;

  return (
    <section
      id="byo-dropzone"
      aria-labelledby="byo-title"
      className="overflow-hidden rounded-2xl border border-cyan-400/15 bg-slate-900/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0">
          <Eyebrow className="text-cyan-300/80">Bring your own snapshot / code</Eyebrow>
          <h2 id="byo-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-50">
            Verify a transition from your own app
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-400">
            Drop or paste a Before and an After screenshot, state what should hold, and add up to 80 lines of the
            component or token source. The same three beats run on it.
          </p>
        </div>
        <button
          type="button"
          data-testid="open-byo-dropzone-btn"
          aria-expanded={open}
          aria-controls="byo-body"
          disabled={!interactive}
          onClick={onToggle}
          className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3.5 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {open ? 'Close dropzone' : 'Open BYO dropzone'}
        </button>
      </div>

      <div
        id="byo-body"
        hidden={!open}
        onPaste={onPaste}
        className="grid gap-4 border-t border-white/5 p-4 sm:px-5 lg:grid-cols-[1.25fr_1fr]"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SnapshotDrop
            label="Before"
            snapshot={draft.before}
            disabled={!interactive}
            onFile={(file) => void acceptFile('before', file)}
          />
          <SnapshotDrop
            label="After"
            snapshot={draft.after}
            disabled={!interactive}
            onFile={(file) => void acceptFile('after', file)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <label className="block">
            <Eyebrow>Expected claim</Eyebrow>
            <textarea
              data-testid="byo-claim-input"
              value={draft.claim}
              onChange={(event) => {
                const claim = event.target.value;
                setDraft((current) => ({ ...current, claim }));
              }}
              rows={2}
              placeholder="e.g. Saving preferences keeps autosave enabled after reload"
              className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-300/60 focus:outline-none"
            />
          </label>
          <label className="block">
            <Eyebrow>Component / token source (optional, ≤ 80 lines)</Eyebrow>
            <textarea
              value={draft.sourceSlice}
              onChange={(event) => {
                const sourceSlice = event.target.value;
                setDraft((current) => ({ ...current, sourceSlice }));
              }}
              rows={5}
              spellCheck={false}
              placeholder=".card { padding: 4px; }"
              className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-300/60 focus:outline-none"
            />
          </label>

          {problem ? (
            <p role="alert" className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {problem}
            </p>
          ) : null}
          {validation && !validation.valid ? (
            <ul className="space-y-1 rounded-md border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {!validation ? (
            <p className="text-xs text-slate-500">Add both snapshots, or load the built-in sample pair.</p>
          ) : null}

          <div className="mt-auto flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="byo-load-sample-pair-btn"
              disabled={!interactive}
              onClick={loadSample}
              className="rounded-lg border border-white/15 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Load sample pair
            </button>
            <button
              type="button"
              data-testid="byo-run-btn"
              disabled={!canRun}
              onClick={run}
              className="rounded-lg border border-cyan-300/60 bg-cyan-400/20 px-3.5 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run BYO verification
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Pixels are diffed in this tab. Only the composite sprite and the source slice are sent to a model, and
            Confidential Mode keeps both on-device.
          </p>
        </div>
      </div>
    </section>
  );
}
