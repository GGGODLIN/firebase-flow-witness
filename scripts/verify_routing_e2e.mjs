import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { chromium } from 'playwright';

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3891;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

async function waitForServerReady(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Next.js server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const serverProc = spawn(
    'npx',
    ['next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      cwd: new URL('..', import.meta.url).pathname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );

  let browser;
  try {
    await waitForServerReady(baseUrl);
    browser = await chromium.launch({ headless: true });

    // Scenario 1: Passive Readiness Pill + H1 3-Beat Verification & Apply Patch Re-Verify
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="readiness-pill"]');
      const pillText = await page.textContent('[data-testid="readiness-pill"]');
      if (!pillText) {
        throw new Error('Scenario 1 failed: Environment Readiness Pill is empty');
      }

      await page.click('[data-testid="run-verification-btn"]');
      await page.waitForSelector('[data-testid="apply-patch-btn"]', {
        timeout: 15000,
      });

      const beforeContradictions = await page.getAttribute(
        '[data-testid="contradiction-count"]',
        'data-count',
      );
      if (Number(beforeContradictions ?? '0') <= 0) {
        throw new Error(
          `Scenario 1 failed: expected active contradictions > 0 before patch, got ${beforeContradictions}`,
        );
      }

      await page.click('[data-testid="apply-patch-btn"]');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="contradiction-count"]')
            ?.getAttribute('data-count') === '0',
        null,
        { timeout: 10000 },
      );

      if (pageErrors.length > 0) {
        throw new Error(`Scenario 1 page errors: ${pageErrors.join('; ')}`);
      }
      await context.close();
    }

    // Scenario 2: Confidential Mode (ONLY_ON_DEVICE) Leak-Zero Guard without window.LanguageModel
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      let leakedCloudCalls = 0;

      await page.route('**/*googleapis.com/**', (route) => {
        leakedCloudCalls += 1;
        return route.abort();
      });

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.click('[data-testid="toggle-confidential-mode"]');
      await page.click('[data-testid="run-verification-btn"]');

      await page.waitForSelector(
        '[data-testid="confidential-blocked-banner"]',
        { timeout: 10000 },
      );
      const bannerText = await page.textContent(
        '[data-testid="confidential-blocked-banner"]',
      );
      if (
        !bannerText ||
        !bannerText.includes('CONFIDENTIAL_MODE_ADAPTER_MISSING')
      ) {
        throw new Error(
          `Scenario 2 failed: expected CONFIDENTIAL_MODE_ADAPTER_MISSING banner, got ${bannerText}`,
        );
      }
      if (leakedCloudCalls !== 0) {
        throw new Error(
          `Scenario 2 failed: leaked ${leakedCloudCalls} cloud requests under ONLY_ON_DEVICE`,
        );
      }

      const receipts = await page.evaluate(
        () => window.__FLOW_WITNESS_RECEIPTS__ ?? [],
      );
      const blockedReceipt = receipts.find(
        (r) => r.fallbackReason === 'CONFIDENTIAL_MODE_ADAPTER_MISSING',
      );
      if (!blockedReceipt || blockedReceipt.cloudCallsMade !== 0) {
        throw new Error(
          'Scenario 2 failed: missing CONFIDENTIAL_MODE_ADAPTER_MISSING receipt with 0 cloud calls',
        );
      }
      await context.close();
    }

    // Scenario 3: Simulate Cloud Outage (FETCH_ERROR) Native Fallback on PREFER_IN_CLOUD with window.LanguageModel
    {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        window.LanguageModel = {
          availability: async () => 'available',
          create: async () => ({
            destroy: () => {},
            prompt: async (input) => {
              const text = JSON.stringify(input ?? '');
              if (text.includes('rootCauseLine') || text.includes('Beat 2')) {
                return JSON.stringify({
                  verdict: 'layout_or_token_break',
                  rootCauseLine: 'PricingCard.tsx:42',
                  explanation:
                    'On-device Gemini Nano fallback diagnosed token collision under simulated cloud outage.',
                  cssOrStatePatch: 'padding-top: var(--space-6);',
                  patchedClaimResolved: true,
                });
              }
              return JSON.stringify({
                verdict: 'layout_or_token_break',
                category: 'token_drift',
                confidence: 0.94,
                reason: 'Detected responsive badge overlap on-device.',
                flaggedRegionIds: 'region-badge',
              });
            },
          }),
        };
      });

      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.click('[data-testid="scenario-tab-H2"]');
      await page.click('[data-testid="toggle-cloud-cut"]');
      await page.click('[data-testid="run-verification-btn"]');

      await page.waitForSelector('[data-testid="beat2-card"]', {
        timeout: 15000,
      });

      const receipts = await page.evaluate(
        () => window.__FLOW_WITNESS_RECEIPTS__ ?? [],
      );
      const fallbackReceipt = receipts.find(
        (r) =>
          r.requestedMode === 'prefer_in_cloud' &&
          r.actualInferenceSource === 'on_device' &&
          r.fallbackTriggered === true &&
          r.fallbackReason === 'CLOUD_FETCH_ERROR_FALLBACK',
      );
      if (
        !fallbackReceipt ||
        fallbackReceipt.singleRequestOptionsPassed?.baseUrl !==
          'https://fault-injection.invalid'
      ) {
        throw new Error(
          `Scenario 3 failed: expected PREFER_IN_CLOUD -> on_device fallback receipt with baseUrl fault injection, got ${JSON.stringify(receipts)}`,
        );
      }
      await context.close();
    }

    // Scenario 4: BYO Snapshot / Code Dropzone & 12-Scenario Benchmark Live Proof
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      await page.click('[data-testid="open-byo-dropzone-btn"]');
      await page.fill(
        '[data-testid="byo-claim-input"]',
        'Billing toggle persists annual discount badge across viewport resize',
      );
      await page.click('[data-testid="byo-load-sample-pair-btn"]');
      await page.click('[data-testid="byo-run-btn"]');

      await page.waitForSelector('[data-testid="beat1-card"]', {
        timeout: 15000,
      });

      await page.click('[data-testid="open-benchmark-drawer-btn"]');
      await page.click('[data-testid="run-live-proof-btn"]');
      await page.waitForSelector('[data-testid="live-proof-completed-badge"]', {
        timeout: 15000,
      });

      const receipts = await page.evaluate(
        () => window.__FLOW_WITNESS_RECEIPTS__ ?? [],
      );
      if (receipts.length < 3) {
        throw new Error(
          `Scenario 4 failed: expected >= 3 receipts after BYO + 3-scenario live proof, got ${receipts.length}`,
        );
      }
      await context.close();
    }

    console.log(
      JSON.stringify({
        status: 'PASS',
        summary: 'FLOW_WITNESS_E2E_VERIFIED: 4/4 scenarios passed',
      }),
    );
  } finally {
    if (browser) {
      await browser.close();
    }
    serverProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
