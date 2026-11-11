import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeTransitionDiff, getBenchmarkCaseMatrix, getHeroScenarios } from '../src/core/flow-witness-engine.ts';
import { applyExamplePatch, renderExample } from '../src/core/executable-examples.ts';
import { applyPatchAndRender, buildEscalationPrompt, countOpenContradictions, pairFromScenario } from '../src/lib/verification-pipeline.ts';
import { createInitialStudioState, studioReducer } from '../src/core/studio-model.ts';

describe('Executable benchmark remediation', () => {
  const cases = getBenchmarkCaseMatrix();
  it('renders independent case pixels, DOM selectors and source slices for C01..C12', () => {
    expect(cases.map((entry) => entry.id)).toEqual(Array.from({ length: 12 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`));
    expect(new Set(cases.map((entry) => JSON.stringify([...entry.afterRgba]))).size).toBe(12);
    expect(new Set(cases.map((entry) => entry.domDelta[0]!.selector)).size).toBe(12);
    for (const scenario of cases) {
      expect(scenario.deterministicSourceSlice).toContain(scenario.id);
      expect(scenario.deterministicSourceSlice.split('\n').length).toBeLessThanOrEqual(80);
      expect(renderExample(scenario.example!).claimSatisfied).toBe(!scenario.groundTruthIsBug);
    }
    const cart = cases[2]!;
    expect(cart.domDelta[0]).toMatchObject({ beforeValue: 'QTY 3', afterValue: 'QTY 1', persistedAfterReload: false });
    expect(buildEscalationPrompt(pairFromScenario(cart), computeTransitionDiff(cart), cart.defaultTriageVerdict)).toContain('preserveQuantity');
  });

  it('executes the actual returned patch and rerenders all six bugs; a wrong patch stays broken', () => {
    for (const scenario of cases.filter((entry) => entry.groundTruthIsBug)) {
      const pair = pairFromScenario(scenario);
      const wrong = applyPatchAndRender(pair, '[{"op":"replace","path":"/style/shadow","value":2}]');
      expect(wrong.claimSatisfied).toBe(false);
      const result = applyPatchAndRender(pair, scenario.defaultEscalationVerdict.cssOrStatePatch);
      expect(result.claimSatisfied).toBe(true);
      expect(result.diff.meaningfulDiffPixels).toBe(0);
      expect(result.pair.recorded).toBeUndefined();
      expect(result.pair.afterRgba).not.toBe(scenario.patchedAfterRgba);
      expect(renderExample(scenario.example!).claimSatisfied).toBe(false);
    }
  });

  it('clears a semantically correct patch even when its pixels differ from the initial reference', () => {
    const scenario = cases[5]!;
    const result = applyPatchAndRender(pairFromScenario(scenario), '[{"op":"replace","path":"/style/maxWidth","value":240}]');
    expect(result.claimSatisfied).toBe(true);
    expect(result.diff.meaningfulDiffPixels).toBeGreaterThan(0);
    expect(result.pair.domDelta[0]?.beforeValue).toBe('2FA: ENABLED');
    let state = studioReducer(createInitialStudioState(), { type: 'START_RUN' });
    state = studioReducer(state, { type: 'BEAT1_COMPLETE', runId: state.activeRunId, triageVerdict: scenario.defaultTriageVerdict });
    state = studioReducer(state, { type: 'BEAT2_COMPLETE', runId: state.activeRunId, escalationVerdict: scenario.defaultEscalationVerdict });
    expect(countOpenContradictions({ triage: state.triageVerdict, escalation: state.escalationVerdict, activeDiff: result.diff })).toBeGreaterThan(0);
    state = studioReducer(state, { type: 'BEAT1_COMPLETE', runId: state.activeRunId, triageVerdict: { verdict: 'benign_transition', category: 'fixed', confidence: 1, reason: 'Full label fits' } });
    state = studioReducer(state, { type: 'APPLY_PATCH' });
    expect(countOpenContradictions({ triage: state.triageVerdict, escalation: state.escalationVerdict, activeDiff: result.diff })).toBe(0);
  });

  it('rejects code, prototype paths, claim edits and invalid patch types', () => {
    const example = cases[0]!.example!;
    for (const patch of ['alert(1)', '[{"op":"replace","path":"/state/value","value":"OFF"}]', '[{"op":"replace","path":"/__proto__/x","value":1}]', '[{"op":"replace","path":"/style/left","value":"hidden"}]']) {
      expect(() => applyExamplePatch(example, patch)).toThrow();
    }
    expect(applyExamplePatch(example, '[{"op":"replace","path":"/settings/storage","value":"local"}]').settings.storage).toBe('local');
  });

  it('suppresses actual subpixel edge differences without hiding a real cart mutation', () => {
    for (const scenario of [cases[6]!, cases[8]!, getHeroScenarios()[2]!]) {
      const diff = computeTransitionDiff(scenario);
      expect(diff.rawDiffPixels).toBeGreaterThan(0);
      expect(diff.aaSuppressedPixels).toBeGreaterThan(0);
      expect(diff.meaningfulDiffPixels).toBeLessThan(diff.rawDiffPixels);
    }
    expect(computeTransitionDiff(cases[2]!).meaningfulDiffPixels).toBeGreaterThan(0);
  });

  it('preserves the full region and its lower-right corner when fitting a 1080p image', () => {
    const width = 1920;
    const height = 1080;
    const beforeRgba = new Uint8ClampedArray(width * height * 4);
    const afterRgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        beforeRgba.set([x < width / 2 ? 255 : 0, 0, y >= height / 2 ? 255 : 0, 255], offset);
        afterRgba.set([0, 255, 0, 255], offset);
      }
    }
    const diff = computeTransitionDiff({ width, height, beforeRgba, afterRgba, candidateRects: [{ id: 'full', x: 0, y: 0, width, height }] });
    const blueCorner = Array.from({ length: diff.spriteWidth * diff.spriteHeight }, (_, index) => diff.spriteRgba[index * 4 + 2]).filter((value) => value === 255);
    expect(blueCorner.length).toBeGreaterThan(0);
    expect(diff.spriteWidth).toBeLessThanOrEqual(384);
    expect(diff.spriteHeight).toBeLessThanOrEqual(384);
  });

  it('preserves cart quantity for arbitrary quantities after the applied fix', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 100 }), (quantity) => {
      const base = cases[2]!.example!;
      const example = { ...base, state: { ...base.state, quantity } };
      const patched = applyExamplePatch(example, cases[2]!.defaultEscalationVerdict.cssOrStatePatch);
      return renderExample(patched).value === `QTY ${quantity}` && renderExample(patched).claimSatisfied;
    }));
  });
});
