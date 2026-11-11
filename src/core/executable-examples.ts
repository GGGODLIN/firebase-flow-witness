import jsonPatch, { type Operation } from 'fast-json-patch';

export interface ExampleDocument {
  readonly id: string;
  readonly kind: 'preferences' | 'role' | 'cart' | 'pricing' | 'modal' | 'security' | 'font' | 'timestamp' | 'chart' | 'skeleton' | 'currency' | 'tooltip';
  readonly title: string;
  readonly settings: {
    readonly storage: 'local' | 'session';
    readonly writeKey: string;
    readonly readKey: string;
    readonly preserveQuantity: boolean;
  };
  readonly style: {
    readonly left: number;
    readonly textColor: number;
    readonly maxWidth: number;
    readonly edgeOffset: number;
    readonly shadow: number;
  };
  readonly state: {
    readonly value: string;
    readonly quantity: number;
    readonly timestamp: number;
    readonly shimmer: number;
    readonly currency: string;
  };
}

export interface ExampleOutput {
  readonly rgba: Uint8ClampedArray;
  readonly value: string;
  readonly claimSatisfied: boolean;
}

const FONT: Readonly<Record<string, string>> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '101111111111101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111',
  '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110',
  '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  '$': '011110010011110', ':': '000010000010000', '.': '000000000000010', '-': '000000111000000',
};

// This renderer executes the example's save/reload and layout rules; patched pixels
// are derived from the edited document, never selected from a stored success frame.
export function renderExample(document: ExampleDocument): ExampleOutput {
  const width = 320;
  const height = 200;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const rect = (x: number, y: number, w: number, h: number, color: number): void => {
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, y + h); py += 1) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, x + w); px += 1) {
        const index = (py * width + px) * 4;
        rgba[index] = (color >> 16) & 255;
        rgba[index + 1] = (color >> 8) & 255;
        rgba[index + 2] = color & 255;
        rgba[index + 3] = 255;
      }
    }
  };
  const text = (value: string, x: number, y: number, color = 0xf1f5f9, maxWidth = 300): void => {
    for (const [index, char] of [...value.toUpperCase()].entries()) {
      const glyph = FONT[char] ?? '000000000000000';
      if (index * 8 + 6 > maxWidth) break;
      for (let bit = 0; bit < glyph.length; bit += 1) {
        if (glyph[bit] === '1') rect(x + index * 8 + (bit % 3) * 2, y + Math.floor(bit / 3) * 2, 2, 2, color);
      }
    }
  };
  rect(0, 0, width, height, 0x0f172a);
  rect(12, 12, 296, 32, 0x1e293b);
  text(`${document.id} ${document.title}`, 20, 23, 0x94a3b8, 278);
  const { settings, state, style, kind } = document;
  let value = state.value;
  let claimSatisfied = true;
  if (kind === 'preferences' || kind === 'role') {
    const local = new Map<string, string>();
    const session = new Map<string, string>();
    (settings.storage === 'local' ? local : session).set(settings.writeKey, state.value);
    value = local.get(settings.readKey) ?? (kind === 'role' ? 'VIEWER' : 'OFF');
    claimSatisfied = value === state.value;
    rect(20, 60, 280, 30, 0x16a34a);
    text('SAVED', 30, 70);
    rect(20, 110, 280, 54, claimSatisfied ? 0x334155 : 0x991b1b);
    text(`RELOAD: ${value}`, 30, 132);
  } else if (kind === 'cart') {
    const cart = [{ sku: 'WITNESS', quantity: state.quantity }];
    const discounted = cart.map((item) => ({ ...item, quantity: settings.preserveQuantity ? item.quantity : 1 }));
    value = `QTY ${discounted[0]!.quantity}`;
    claimSatisfied = discounted[0]!.quantity === state.quantity;
    text('PROMO APPLIED', 24, 65, 0x4ade80);
    rect(20, 95, 280, 66, 0x334155);
    text(`WITNESS ${value}`, 32, 120);
  } else if (kind === 'pricing') {
    rect(20, 60, 126, 114, 0x334155);
    rect(168, 60, 132, 114, 0x334155);
    text('FREE', 30, 78);
    text('PRO', 180, 78);
    rect(style.left, 104, 118, 30, 0xea580c);
    text('SAVE 20', style.left + 6, 114);
    value = `badge-left:${style.left}`;
    claimSatisfied = style.left >= 168 && style.left + 118 <= 300;
  } else if (kind === 'modal') {
    rect(30, 60, 260, 112, 0x1e293b);
    text('CONFIRM CHANGES', 44, 78);
    rect(50, 116, 220, 38, 0x334155);
    text('SAVE', 140, 130, style.textColor);
    value = `text-color:${style.textColor}`;
    const luminance = (color: number): number => {
      const channels = [16, 8, 0].map((shift) => ((color >> shift) & 255) / 255)
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const textLuminance = luminance(style.textColor);
    const backgroundLuminance = luminance(0x334155);
    claimSatisfied = (Math.max(textLuminance, backgroundLuminance) + 0.05)
      / (Math.min(textLuminance, backgroundLuminance) + 0.05) >= 4.5;
  } else if (kind === 'security') {
    rect(40, 82, Math.min(240, style.maxWidth), 40, 0x334155);
    text(state.value, 48, 97, style.textColor, style.maxWidth - 16);
    claimSatisfied = style.maxWidth >= state.value.length * 8 + 16;
    value = claimSatisfied ? state.value : '2FA: EN...';
  } else if (kind === 'font' || kind === 'chart') {
    text(kind === 'font' ? 'IDENTICAL GLYPHS' : 'SERIES 10 20 30', 24, 60);
    // Analytic coverage creates genuine subpixel edge pixels between stable
    // black/white neighbors, which pixelmatch's AA detector can classify.
    const count = kind === 'font' ? 18 : 8;
    for (let line = 0; line < count; line += 1) {
      const x = 18 + (line % 6) * 48;
      const y = 86 + Math.floor(line / 6) * 32;
      rect(x, y, 30, 26, 0x000000);
      for (let py = 0; py < 26; py += 1) {
        for (let px = 0; px < 30; px += 1) {
          const coverage = Math.max(0, Math.min(1, px - py * 0.6 - 4 + style.edgeOffset));
          const grey = Math.round(coverage * 255);
          rect(x + px, y + py, 1, 1, (grey << 16) | (grey << 8) | grey);
        }
      }
    }
    value = kind === 'font' ? 'IDENTICAL GLYPHS' : '10,20,30';
  } else if (kind === 'timestamp') {
    value = `${state.timestamp}M AGO`;
    for (let index = 0; index < 18; index += 1) {
      text(value, 12 + (index % 3) * 102, 62 + Math.floor(index / 3) * 20, 0x38bdf8);
    }
  } else if (kind === 'skeleton') {
    const level = state.shimmer;
    rect(30, 74, 58, 58, (level << 16) | (level << 8) | level);
    rect(106, 82, 170, 14, 0x475569);
    rect(106, 112, 116, 10, 0x334155);
    text('LOADING PROFILE', 30, 156);
    value = 'LOADING PROFILE';
  } else if (kind === 'currency') {
    value = `${state.currency}29`;
    text('SAME AMOUNT: 29 USD', 26, 66);
    rect(24, 96, 270, 64, 0x334155);
    text(value, 48, 120, 0x4ade80);
  } else {
    rect(42 - style.shadow, 82 - style.shadow, 236 + style.shadow * 2, 52 + style.shadow * 2, 0x475569);
    rect(42, 82, 236, 52, 0x1e293b);
    text('HELP: SAFE TO CONTINUE', 50, 104);
    value = 'HELP: SAFE TO CONTINUE';
  }
  return { rgba, value, claimSatisfied };
}

export function applyExamplePatch(document: ExampleDocument, patchText: string): ExampleDocument {
  const raw: unknown = JSON.parse(patchText);
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 16) {
    throw new Error('Patch must be a non-empty RFC 6902 JSON array with at most 16 operations.');
  }
  const allowed = new Set([
    '/settings/storage', '/settings/writeKey', '/settings/preserveQuantity',
    '/style/left', '/style/textColor', '/style/maxWidth', '/style/edgeOffset', '/style/shadow',
  ]);
  for (const op of raw as unknown[]) {
    if (typeof op !== 'object' || op === null || !('op' in op) || op.op !== 'replace'
      || !('path' in op) || typeof op.path !== 'string' || !allowed.has(op.path) || !('value' in op)) {
      throw new Error('Only replace operations on the supplied example settings/style are supported.');
    }
    const expected = op.path === '/settings/storage' || op.path.endsWith('Key') ? 'string'
      : op.path === '/settings/preserveQuantity' ? 'boolean' : 'number';
    if (typeof op.value !== expected || (typeof op.value === 'number' && (!Number.isFinite(op.value) || Math.abs(op.value) > 0xffffff))) {
      throw new Error('Patch value has an invalid type or range.');
    }
    if (op.path === '/settings/storage' && op.value !== 'local' && op.value !== 'session') {
      throw new Error('Storage must be local or session.');
    }
  }
  return jsonPatch.applyPatch(structuredClone(document), raw as Operation[], true, true, true).newDocument;
}
