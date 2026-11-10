'use client';

import type { InferenceReceipt } from '../core/flow-witness-engine.ts';
import { Eyebrow, formatInteger, ModeChip, SourceBadge } from './ui.tsx';

const VISIBLE_ROWS = 12;

function exportLedger(fallback: readonly InferenceReceipt[]): void {
  const ledger =
    (globalThis as { __FLOW_WITNESS_RECEIPTS__?: InferenceReceipt[] }).__FLOW_WITNESS_RECEIPTS__ ?? fallback;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(ledger, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'flow-witness-receipts.json';
  anchor.click();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ReceiptLedgerProps {
  readonly receipts: readonly InferenceReceipt[];
}

export function ReceiptLedger({ receipts }: ReceiptLedgerProps) {
  const newestFirst = receipts.slice(-VISIBLE_ROWS).reverse();
  return (
    <section
      aria-labelledby="ledger-title"
      className="overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0">
          <Eyebrow>Inference receipt ledger · window.__FLOW_WITNESS_RECEIPTS__</Eyebrow>
          <h2 id="ledger-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-50">
            Every routing decision, auditable
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {receipts.length === 0
              ? 'Run a verification to record the first receipt.'
              : `${formatInteger(receipts.length)} receipts this session${receipts.length > VISIBLE_ROWS ? `, newest ${VISIBLE_ROWS} shown` : ''}.`}
          </p>
        </div>
        <button
          type="button"
          disabled={receipts.length === 0}
          onClick={() => exportLedger(receipts)}
          className="rounded-lg border border-white/15 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export JSON
        </button>
      </div>
      {newestFirst.length > 0 ? (
        <div className="overflow-x-auto border-t border-white/5">
          <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
            <thead className="bg-slate-950/70 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2">receipt</th>
                <th scope="col" className="px-3 py-2">requested</th>
                <th scope="col" className="px-3 py-2">actual source</th>
                <th scope="col" className="px-3 py-2">fallback</th>
                <th scope="col" className="px-3 py-2">calls</th>
                <th scope="col" className="px-3 py-2">latency</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((receipt) => (
                <tr key={`${receipt.receiptId}@${receipt.timestampIso}`} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{receipt.receiptId}</td>
                  <td className="px-3 py-2">
                    <ModeChip mode={receipt.requestedMode} />
                  </td>
                  <td className="px-3 py-2">
                    <SourceBadge source={receipt.actualInferenceSource} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                    {receipt.fallbackTriggered ? '↺ ' : ''}
                    {receipt.fallbackReason}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                    {receipt.onDeviceCallsMade} device · {receipt.cloudCallsMade} cloud
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                    {formatInteger(receipt.latencyMs)} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
