import type { TransitionScenario } from './flow-witness-engine.ts';
import { applyExamplePatch, renderExample, type ExampleDocument } from './executable-examples.ts';

interface CaseDefinition {
  readonly kind: ExampleDocument['kind'];
  readonly title: string;
  readonly claim: string;
  readonly before: string | number;
  readonly after: string | number;
  readonly path: string;
  readonly bug: boolean;
  readonly unsure?: boolean;
  readonly selector: string;
}

const CASES: readonly CaseDefinition[] = [
  { kind: 'preferences', title: 'Optimistic Save Toast vs Storage Key Reversion', claim: 'Save persists autosave ON across reload', before: 'local', after: 'session', path: '/settings/storage', bug: true, selector: 'input[name="autosave"]' },
  { kind: 'role', title: 'Optimistic Role Toggle Drops Tenant Scope on Reload', claim: 'Tenant acme reloads the saved ADMIN role', before: 'tenant:acme:role', after: 'role', path: '/settings/writeKey', bug: true, selector: '[data-tenant="acme"] [data-role]' },
  { kind: 'cart', title: 'Silent Cart Quantity Mutation on Promo Apply', claim: 'Applying promo preserves line-item quantity 3', before: 1, after: 0, path: '/settings/preserveQuantity', bug: true, unsure: true, selector: '[data-sku="WITNESS"] [data-quantity]' },
  { kind: 'pricing', title: 'Responsive Pricing Card Badge Overlap at 375px', claim: 'Discount badge stays inside Pro card at 375px', before: 176, after: 128, path: '/style/left', bug: true, selector: '.pricing-card--pro .discount-badge' },
  { kind: 'modal', title: 'Dark-Mode Surface Token Inversion on Modal Footer', claim: 'Save label contrasts with dark modal footer', before: 0xf1f5f9, after: 0x334155, path: '/style/textColor', bug: true, selector: '.modal-footer button' },
  { kind: 'security', title: 'Truncated Security Status Pill (2FA: En...)', claim: '2FA: ENABLED remains fully readable', before: 220, after: 72, path: '/style/maxWidth', bug: true, unsure: true, selector: '[data-testid="security-pill"]' },
  { kind: 'font', title: 'Subpixel Font Hinting Jitter Across DPR 1.5 to 2.0', claim: 'Glyph edges change without changing text or layout', before: 0.15, after: 0.8, path: '/style/edgeOffset', bug: false, selector: '.font-sample' },
  { kind: 'timestamp', title: 'Relative Timestamp Tick (1m ago to 2m ago)', claim: 'Relative time advances without losing feed state', before: 1, after: 2, path: '/state/timestamp', bug: false, selector: 'time[data-relative]' },
  { kind: 'chart', title: 'Chart Gridline 1px Subpixel Raster Shift', claim: 'Series values remain 10,20,30 across raster changes', before: 0.05, after: 0.75, path: '/style/edgeOffset', bug: false, selector: 'canvas[data-series="10,20,30"]' },
  { kind: 'skeleton', title: 'Avatar Skeleton Shimmer Frame Delta', claim: 'Profile skeleton pulses while loading', before: 55, after: 100, path: '/state/shimmer', bug: false, selector: '[aria-busy="true"] .avatar-skeleton' },
  { kind: 'currency', title: 'Localized Currency Symbol Formatting (US$29 to $29)', claim: 'Locale formatting preserves amount 29 USD', before: 'US$', after: '$', path: '/state/currency', bug: false, selector: '[data-amount="29"][data-currency="USD"]' },
  { kind: 'tooltip', title: 'Ambiguous Tooltip Border Shadow Reflow (Benign Control)', claim: 'Tooltip message and anchor remain unchanged', before: 1, after: 4, path: '/style/shadow', bug: false, unsure: true, selector: '[role="tooltip"]' },
];

export function createExampleScenarios(): readonly TransitionScenario[] {
  return CASES.map((definition, index) => {
    const id = `C${String(index + 1).padStart(2, '0')}`;
    const base: ExampleDocument = {
      id,
      kind: definition.kind,
      title: definition.kind,
      settings: {
        storage: 'local', writeKey: definition.kind === 'role' ? 'tenant:acme:role' : 'prefs_v2',
        readKey: definition.kind === 'role' ? 'tenant:acme:role' : 'prefs_v2', preserveQuantity: true,
      },
      style: { left: 176, textColor: 0xf1f5f9, maxWidth: 220, edgeOffset: 0.15, shadow: 1 },
      state: { value: definition.kind === 'role' ? 'ADMIN' : definition.kind === 'security' ? '2FA: ENABLED' : 'ON', quantity: 3, timestamp: 1, shimmer: 55, currency: 'US$' },
    };
    const valueFor = (value: string | number): string | number | boolean => definition.kind === 'cart' ? value === 1 : value;
    const changeDocument = (value: string | number): ExampleDocument => {
      const [group, field] = definition.path.slice(1).split('/') as [keyof Pick<ExampleDocument, 'settings' | 'style' | 'state'>, string];
      return { ...base, [group]: { ...base[group], [field]: valueFor(value) } };
    };
    const beforeDocument = changeDocument(definition.before);
    const example = changeDocument(definition.after);
    const before = renderExample(beforeDocument);
    const after = renderExample(example);
    const patch = definition.bug ? JSON.stringify([{ op: 'replace', path: definition.path, value: valueFor(definition.before) }]) : '';
    const patched = definition.bug ? renderExample(applyExamplePatch(example, patch)) : after;
    const persistence = ['preferences', 'role', 'cart'].includes(definition.kind);
    const category = definition.bug ? (persistence ? 'false_green_persistence_lie' : 'layout_or_token_break') : 'benign_transition';
    return {
      id, title: definition.title, subtitle: definition.claim, expectedClaim: definition.claim,
      category, groundTruthIsBug: definition.bug, width: 320, height: 200,
      beforeRgba: before.rgba, afterRgba: after.rgba, patchedAfterRgba: patched.rgba,
      example,
      candidateRects: [{ id: `${id}-${definition.kind}`, label: definition.title, x: 0, y: 48, width: 320, height: 152 }],
      domDelta: [{ selector: definition.selector, attributeOrText: 'rendered value / state', beforeValue: before.value, afterValue: after.value, persistedAfterReload: after.claimSatisfied }],
      deterministicSourceSlice: [
        `// ${id}: ${definition.title}`,
        'import { renderExample } from "./executable-examples";',
        `const example = ${JSON.stringify(example, null, 2)};`,
        'const output = renderExample(example);',
        ...({
          preferences: ['// Runtime: (storage === "local" ? local : session).set(writeKey, value);', '// After reload: displayedValue = local.get(readKey) ?? "OFF";'],
          role: ['// Runtime: (storage === "local" ? local : session).set(writeKey, value);', '// After reload: displayedRole = local.get(readKey) ?? "VIEWER";'],
          cart: ['// Runtime: discounted = cart.map(item => ({ ...item, quantity: preserveQuantity ? item.quantity : 1 }));'],
          pricing: ['// Runtime: Pro card bounds x=168..300; discount badge bounds x=left..left+118.'],
          modal: ['// Runtime: Save button background=#334155; text uses textColor (integer RGB); contrast must be >=4.5.'],
          security: ['// Runtime: text is clipped at maxWidth-16; label needs value.length*8+16 pixels.'],
          font: ['// Runtime: edgeOffset changes analytic glyph-edge coverage; text and bounds do not change.'],
          timestamp: ['// Runtime: render timestamp + "M AGO"; advancing time is expected.'],
          chart: ['// Runtime: edgeOffset changes raster coverage; series stays [10,20,30].'],
          skeleton: ['// Runtime: shimmer changes loading placeholder brightness, not loaded profile state.'],
          currency: ['// Runtime: currency prefix changes; amount remains 29 USD.'],
          tooltip: ['// Runtime: shadow changes outside tooltip bounds; text and anchor do not change.'],
        } satisfies Record<ExampleDocument['kind'], readonly string[]>)[definition.kind],
        `// Expected claim: ${definition.claim}`,
        '// Patch format: RFC 6902 JSON array of replace operations on example settings/style.',
        `// Editable path: ${definition.path}; current value: ${JSON.stringify(valueFor(definition.after))}`,
      ].join('\n'),
      defaultTriageVerdict: {
        verdict: definition.unsure ? 'unsure' : category,
        category: definition.kind, confidence: definition.unsure ? 0.5 : 0.95,
        reason: `${definition.claim}. Observed: ${after.value}.`, flaggedRegionIds: `${id}-${definition.kind}`,
      },
      defaultEscalationVerdict: {
        verdict: category, rootCauseLine: `${id}.example.json:${definition.path}`,
        explanation: definition.bug ? `${definition.path} contradicts the expected claim.` : `${definition.claim}; this is an intentional display change.`,
        cssOrStatePatch: patch, patchedClaimResolved: patched.claimSatisfied,
      },
    };
  });
}
