# FlowWitness 實作決定帳本（`.scratch/flow-witness/choices.md`）

## Pass 1 — Tickets `01..03` 與 Step 3.5 收尾修補（`c566f86..HEAD`，2026-11-10）

### 八類掃描總覽

- **資料形狀與格式**：有（C3：Beat 0 6×4 網格聚類演算法與預設單一 tile Token 常數 `258`；C4：Playwright `window.__FLOW_WITNESS_RECEIPTS__` 與單次驗證視圖 `RunView` 的誠實來源標記 `AnswerOrigin`）
- **存放位置與命名**：有（C5：真模型執行期介面拆分為 `src/lib/*` 與 `src/components/*`，而保持 `src/core/*` 為無瀏覽器 DOM 副作用的純函式）
- **API 契約與錯誤行為**：有（C2：單目標插槽 `ONLY_IN_CLOUD` 搭配無憑證拋錯，防止偽造 `in_cloud` 收據；C7：在途驗證期間切換 `TOGGLE_CONFIDENTIAL_MODE` 立即遞增 `activeRunId` 並設為 `cancelled`）
- **新增的相依套件，連同它帶進來的預設行為與上限**：有（C1：`firebase@^13.1.0` 版本釘定以避開本機 npm 7 日供應鏈檢疫期，保留 `@firebase/ai@3.0.0`）
- **並行與效能取捨：快取、容量上限、逾時、重試**：有（C6：12 案例 Benchmark Live Proof 採用無延遲逐筆序列 `await` 搭配 `liveBusy` 按鈕鎖定，取代複雜的 token-bucket 計時器）
- **範圍解讀：套用範圍比規格寬或窄**：有（C8：按下 `Apply Patch & Re-Verify` 時只重跑確定性 Beat 0 `patchedDiff` 驗證矛盾歸零，不重送 Beat 1 模型推論；C9：省略規格中標為 optional 的 `ONLY_IN_CLOUD` Deep Tool Inspect 多輪 Function Calling 動作）
- **測試設定改動：timeout、skip、mock、放寬斷言**：有（C10：在 `scripts/verify_routing_e2e.mjs` Scenario 2 的初始化腳本中主動 `delete window.LanguageModel`，以覆寫 Playwright 1.64 HeadlessChrome 151 在 `127.0.0.1` 內建的回音假物件）
- **之後的程式會照抄的模式**：有（C2 與 C5 的「純核心引擎 + 瀏覽器單目標插槽注入」架構模式）

---

### 逐條決定明細

#### C1：`firebase` 套件釘定於 `^13.1.0`（解析為 `firebase@13.1.0` 與 `@firebase/ai@3.0.0`）
- **何時**：Ticket `01` 環境建置（commit `9befc4c`，`package.json:17`）
- **決定**：先解決供應鏈檢疫阻擋再安裝。
  - **觸發事件**：規格書寫 `firebase@^13.2.0`，但本機 npm 設有 7 日供應鏈檢疫期（`before 2026-11-03`），而 `firebase@13.2.0` 發布於 `2026-11-02T18:16Z`，執行 `npm install` 時被 npm `ETARGET` 拒絕安裝。
  - **現在怎麼做**：在 `package.json:17` 改指定 `"firebase": "^13.1.0"`，它於檢疫期前發布且內部同樣搭載完全相同的 `@firebase/ai@3.0.0`（匯出 `InferenceMode`、`Schema`、`getAI`、`getGenerativeModel`、`GoogleAIBackend`）。
  - **沒選的做法會怎樣**：若強行關掉 npm 7 日檢疫期去裝 `13.2.0`，會違反本機供應鏈防禦規則；若停下來等檢疫期過，則卡住黑客松實作進度。
- **規格缺口**：`.scratch/flow-witness/spec.md` 與 Ticket `01` 寫 `firebase@^13.2.0`，未考量本機 npm 7 日 `before` 時間窗對剛發布次版本的攔截。
- **影響範圍**：`package.json:17` 與 `package-lock.json:2884` 的 `firebase` 版本號。
- **判定**：`sound` — `@firebase/ai@3.0.0` 在 `firebase@13.1.0` 與 `13.2.0` 完全一致，既滿足賽事 SDK 要求又遵守本機供應鏈檢疫。
- **把握度**：高

#### C2：瀏覽器執行期將雲端插槽綁定為 `InferenceMode.ONLY_IN_CLOUD`，並在未配置 `NEXT_PUBLIC_FIREBASE_*` 時直接拋錯、於 UI 標示 `Deterministic Replay (No Firebase Env)`
- **何時**：Ticket `03` 真模型插槽接線（commit `350b409`，`src/lib/firebase-cloud.ts:105-122`、`src/lib/hybrid-runtime.ts:62-79`、`src/lib/verification-pipeline.ts:326-334`）
- **決定**：讓應用層 `executeHybridInference()` 單獨掌控混合退回，並拒絕在無憑證時偽造 `in_cloud` 收據。
  - **觸發事件**：Ticket `03` 要求徽章與收據如實反映推論來源（truthful `inferenceSource` badges），同時本機無頭 E2E 驗證環境並沒有設定真實的 `NEXT_PUBLIC_FIREBASE_*` 雲端憑證。
  - **現在怎麼做**：`invokeFirebaseCloud()`（`src/lib/firebase-cloud.ts:105`）以 `InferenceMode.ONLY_IN_CLOUD` 呼叫 `getGenerativeModel()`；當環境未設定 `NEXT_PUBLIC_FIREBASE_*` 時，`createBrowserHybridRuntime().invokeInCloud`（`src/lib/hybrid-runtime.ts:63`）直接拋出錯誤，使 `executeHybridInference()` 將收據如實記為 `actualInferenceSource: "none"`、`cloudCallsMade: 0`，並由 `answerOriginOf()`（`src/lib/verification-pipeline.ts:326`）標記為 `replay`，在畫面顯示預錄判決與 `Deterministic Replay · No Firebase Env` 標籤。
  - **沒選的做法會怎樣**：若不傳 `invokeInCloud` 插槽或在無環境變數時讓插槽回傳預錄 JSON 字串，`executeHybridInference()` 會以為雲端呼叫成功而產出 `actualInferenceSource: "in_cloud"`、`cloudCallsMade: 1` 的假收據，評審打開 DevTools Network 面板看到 0 筆請求卻看到 `in_cloud` 徽章就會判定造假。
- **規格缺口**：`.scratch/flow-witness/spec.md` 假設執行環境永遠有雲端憑證或由 `@firebase/ai` 內部 `callCloudOrDevice()` 包辦退回，沒定義「無雲端憑證的本機 E2E / 評審離線試玩」時收據與 UI 徽章如何同時保持誠實與可操作。
- **影響範圍**：`src/lib/firebase-cloud.ts`、`src/lib/hybrid-runtime.ts`、`src/lib/verification-pipeline.ts`、`scripts/verify_routing_e2e.mjs`（Tracer T1）。
- **判定**：`sound` — 確保每一張 `InferenceReceipt` 的 `actualInferenceSource` 與實際網路／端側呼叫 100% 吻合，不捏造雲端呼叫次數。
- **把握度**：高

#### C3：Beat 0 未指定候選框時採用 6×4 網格聚類（`extractGridClusters`），且非空合成圖的預估影像 Token 固定記為 `258`
- **何時**：Ticket `01` 實作（commit `9befc4c`，`src/core/flow-witness-engine.ts:821-876, 954-1004`）
- **決定**：以固定 6×4 網格掃描取代連通分量遞迴搜尋，並將 `<= 384×384 px` 單一 tile 的預估 Token 釘為 `258`。
  - **觸發事件**：`computeTransitionDiff()` 需要在無 `candidateRects`（例如使用者在 BYO Dropzone 上傳任意兩張截圖）時，將 `pixelmatch` 找出的差異像素聚類為最多 6 個有界矩形（bounding boxes），並計算單一 tile 影像 Token 數。
  - **現在怎麼做**：`extractGridClusters()`（`src/core/flow-witness-engine.ts:821`）將畫布均分為 6 列 × 4 行共 24 格，計算每格內 `diffMaskRgba` alpha > 0 的最小包圍盒，再依差異像素數由大到小取前 6 個；只要 `clusteredRegions.length > 0` 且合成圖尺寸限制在 `<= 384×384 px` 內，`estimatedImageTokens` 固定回傳 Gemini 單一影像 tile 的官方常數 `258`（`src/core/flow-witness-engine.ts:1003`）。
  - **沒選的做法會怎樣**：若寫 DFS/BFS flood-fill 連通分量演算法，遇到高密度雜訊圖時容易產生數百個微型碎片且耗費 CPU；6×4 網格在 $O(W \times H)$ 單次掃描內穩定收斂且天然防碎片化。
- **規格缺口**：規格只要求 `clusteredRegions.length <= 6` 與 `<= 384×384 px`（258 tokens），未指定無 DOM 候選框時的像素聚類演算法。
- **影響範圍**：`src/core/flow-witness-engine.ts:821-1005` 與 BYO 自訂截圖的差異框分布。
- **判定**：`sound` — 時間複雜度固定為線性且通過 `P3` 100 次隨機畫布屬性測試。
- **把握度**：高

#### C4：在 `window.__FLOW_WITNESS_RECEIPTS__` 保留不可變收據帳本，並在 UI 層以 `RunView` 保存被 `CANCEL_RUN` 中止後的阻斷／錯誤畫面
- **何時**：Ticket `03` 實作（commit `f292b80`、`350b409`，`src/core/flow-witness-engine.ts:667-675`、`src/lib/run-view.ts:30-35`、`src/components/workbench.tsx:160-232`）
- **決定**：將引擎層稽核收據同步寫入 `window.__FLOW_WITNESS_RECEIPTS__`，並在 UI 用獨立於 `StudioState` 的 `RunView` 承載單次執行的阻斷橫幅。
  - **觸發事件**：當 `ONLY_ON_DEVICE` 因缺少 `window.LanguageModel` 而回傳 `status: 'blocked'` 時，`workbench.tsx:203` 會派發 `CANCEL_RUN` 把 `studioReducer` 的 `runPhase` 設為 `'cancelled'`；若 UI 只看 `StudioState`，阻斷原因（`CONFIDENTIAL_MODE_ADAPTER_MISSING`）就沒有欄位可存。
  - **現在怎麼做**：`executeHybridInference()` 將每筆收據推入 `window.__FLOW_WITNESS_RECEIPTS__`（供 E2E 與 DevTools 稽核），而 `workbench.tsx` 用 `RunView`（以 `runId` 綁定）保存當次 `triage` / `escalation` 的 `HybridInferenceOutcome`，使 `CANCEL_RUN` 後畫面仍能渲染 `[data-testid="confidential-blocked-banner"]`。
  - **沒選的做法會怎樣**：若為了保存阻斷訊息去修改 `StudioState` 與 `studioReducer` 的既有欄位結構，會影響 Ticket `02` 已鎖定的 `P4` 狀態機與獨立 Shadow Oracle 測試。
- **規格缺口**：`StudioState` 原型只定義了 `triageVerdict` 與 `escalationVerdict`，未定義 `blocked` 狀態下的錯誤收據存放欄位。
- **影響範圍**：`src/lib/run-view.ts`、`src/components/workbench.tsx`、`src/components/storyboard.tsx`。
- **判定**：`sound` — 不動 `StudioState` 核心契約即可完整呈現阻斷橫幅與來源標籤。
- **把握度**：高

#### C5：將純邏輯核心（`src/core/*`）與瀏覽器 DOM／Canvas／SDK 副作用層（`src/lib/*`、`src/components/*`）嚴格分離
- **何時**：Ticket `01..03`（commit `9befc4c`、`350b409`）
- **決定**：`src/core/flow-witness-engine.ts` 只操作 `Uint8ClampedArray` 與抽象 `HybridRuntimeAdapter`；所有 `HTMLCanvasElement`、`createImageBitmap`、`FileReader`、`URL.createObjectURL` 與 `firebase/app-check` 實例化全部放在 `src/lib/*`。
  - **觸發事件**：Vitest 單元與 `fast-check` 屬性測試（`P1..P4`）需要在 Node.js 環境毫秒級高速執行，不能依賴真實瀏覽器 Canvas 或網路。
  - **現在怎麼做**：`src/core/*` 保持 100% Node.js 可執行的純函式與狀態機（19 個測試在 `~280ms` 內跑完），瀏覽器專屬的 JPEG 轉碼（`src/lib/sprite-image.ts`）與 Firebase 連線（`src/lib/firebase-cloud.ts`）由 UI 層在瀏覽器端注入。
  - **沒選的做法會怎樣**：若在 `flow-witness-engine.ts` 直接呼叫 `document.createElement('canvas')` 或 `initializeAppCheck()`，Node.js 下的 `P1..P3` 屬性測試就會因缺少瀏覽器 API 而崩潰或被迫引入沉重的 DOM mock。
- **規格缺口**：規格未規定檔案目錄切分方式。
- **影響範圍**：`src/core/*`、`src/lib/*`、`src/components/*`。
- **判定**：`sound` — 讓核心不變量測試與瀏覽器 E2E 職責乾淨分離。
- **把握度**：高

#### C6：12 案例 Benchmark Drawer 的 Live Proof 採用序列 `for...of await` 搭配 `liveBusy` 鎖定，取代 token-bucket 速率限制器
- **何時**：Ticket `03` 實作（commit `350b409`、`c8464f5`，`src/components/workbench.tsx:271-306`）
- **決定**：以單通道序列執行與 UI `disabled={busy}` 按鈕鎖定控制速率，不另外實作時鐘型 token-bucket 佇列。
  - **觸發事件**：Ticket `02` 標題與規格提到避免多列同時連打雲端觸發 429，且端側 Gemini Nano 一次只能服務 1 個 session。
  - **現在怎麼做**：`runLiveProof()`（`src/components/workbench.tsx:287`）使用 `for (const caseId of LIVE_PROOF_CASE_IDS)` 逐筆 `await executeAndRecordLiveCase(scenario)`，並在執行期間將 `liveBusy` 設為 `true` 停用所有 Live 按鈕；底層 `executeHybridInference()` 另有 `enqueueOnDeviceMutex` 保證併發數 $\le 1$。
  - **沒選的做法會怎樣**：若額外寫一套計時器 token-bucket 限流器，除了增加無謂的狀態複雜度與等待延遲外，在 Ticket `02`/`03` YAGNI 審查時也會因無獨立驗收斷言而被判 `demote`/`kill`。
- **規格缺口**：Ticket `02` 標題提及 token-bucket，但驗收條件只驗 3-Scenario Live Proof 與逐列 Verify Live 能無錯完成並寫入收據。
- **影響範圍**：`src/components/workbench.tsx:271-306`、`src/components/benchmark-drawer.tsx`。
- **判定**：`sound` — 序列執行加 FIFO mutex 已從結構上消除併發搶鎖與 burst 429，比計時器限流更簡單可靠。
- **把握度**：高

#### C7：在途驗證期間切換 `TOGGLE_CONFIDENTIAL_MODE` 時，立即遞增 `activeRunId` 並將 `runPhase` 轉為 `'cancelled'`
- **何時**：Step 3.5 收尾審查修補（`src/core/studio-model.ts:144-153`、`tests/studio-model.test.ts:78-86, 268-277`）
- **決定**：只要驗證還在飛（`running_beat1` 或 `running_beat2`），切換機密模式就立即作廢當次 run。
  - **觸發事件**：`security-reviewer`（Finding F-01）指出若使用者在 Beat 1 執行中途打開 Confidential Mode，UI 立即顯示 `ONLY_ON_DEVICE · 0 cloud bytes`，但 `runStoryboard()` 在開頭擷取的舊快照仍是 `confidentialMode: false`，若 `activeRunId` 不變，Beat 1 完成後仍會推進到 Beat 2 雲端呼叫。
  - **現在怎麼做**：在 `studioReducer`（`src/core/studio-model.ts:144`）處理 `TOGGLE_CONFIDENTIAL_MODE` 時，若 `state.runPhase === 'running_beat1' || state.runPhase === 'running_beat2'`，同步將 `activeRunId` 加 1 並把 `runPhase` 設為 `'cancelled'`，使在途的 `isCurrent()` 立即返回 `false` 並中止後續的 Beat 2 呼叫。
  - **沒選的做法會怎樣**：若允許在途 run 用舊的 `confidentialMode: false` 繼續跑完，畫面已經承諾 `0 cloud bytes` 卻在背景發送雲端請求，違反機密模式的核心安全承諾。
- **規格缺口**：規格 `P4` 列舉了 `START_RUN`、`SELECT_SCENARIO`、`LOAD_BYO_SNAPSHOT`、`CANCEL_RUN` 會遞增 `activeRunId`，漏列在途切換 `TOGGLE_CONFIDENTIAL_MODE` 的交錯情況。
- **影響範圍**：`src/core/studio-model.ts:144-153`、`tests/studio-model.test.ts:78-86, 268-277`。
- **判定**：`sound` — 補齊機密模式在非同步交錯下的零外洩邊界。
- **把握度**：高

#### C8：按下 `Apply Patch & Re-Verify` 時，以 Beat 0 `patchedDiff`（`0` 差異像素）直接將矛盾數歸零，不重送 Beat 1 模型推論
- **何時**：Ticket `03` 實作（commit `350b409`，`src/components/workbench.tsx:143-155, 418`、`src/components/storyboard.tsx:256-261`）
- **決定**：套用修補後直接用確定性 Beat 0 的 `patchedDiff` 重算矛盾數（`countOpenContradictions`），不再消耗一次端側或雲端模型呼叫。
  - **觸發事件**：當使用者點擊 `Apply Patch & Re-Verify` 時，畫面切換為修補後的 `patchedAfterRgba`，此時它與基準圖的 `computeTransitionDiff` 已經是 `0` 個 meaningful diff pixels、`0` 個 clustered regions。
  - **現在怎麼做**：`APPLY_PATCH` 將 `studio.patched` 設為 `true`，`workbench.tsx:148-154` 將 `activeDiff` 切換為 `patchedDiff`（`0` 個區域），使 `[data-testid="contradiction-count"]` 的 `data-count` 立即從 `> 0` 降為 `"0"`，並在 Beat 0 卡片顯示 `Re-verify on patched frame: 0 meaningful px · 0 regions · Beat 1 not needed`。
  - **沒選的做法會怎樣**：若對一張 `0` 差異區域的空白合成圖再去呼叫一次 Gemini Nano / Cloud Gemini，既浪費延遲與額度，且空合成圖本身沒有任何視覺差異可供模型判讀。
- **規格缺口**：規格 Story 3 寫「re-runs Beat 0 + Beat 1 to prove the contradiction count drops from `1` to `0`」，未考慮修補後 Beat 0 差異區域已歸零、無需進 Beat 1 的情況。
- **影響範圍**：`src/components/workbench.tsx:143-155`、`src/components/storyboard.tsx:256-261`。
- **判定**：`sound` — 符合三拍漏斗「Beat 0 歸零即不驚動模型」的設計原則，且通過 E2E Scenario 1 驗收。
- **把握度**：中

#### C9：省略規格中標為 optional 的 `ONLY_IN_CLOUD` `"Deep Tool Inspect"` Function Calling 次要按鈕
- **何時**：Ticket `03` 實作（commit `350b409`）
- **決定**：Beat 2 統一採用預切原始碼（`deterministicSourceSlice <= 80 lines`）單輪 `PREFER_IN_CLOUD` 結構化診斷，不實作選用的多輪 Function Calling `"Deep Tool Inspect"` 按鈕。
  - **觸發事件**：使用者在 `/review-brainstorm` 拍板 `2a` 時已決定主路徑改為「確定性預切原始碼單輪診斷」以保住 `@firebase/ai` 雲端斷網自動退回端側的能力，只把 `ONLY_IN_CLOUD` Function Calling 留作 optional 次要按鈕；而 Ticket `01..03` 的驗收條件與 E2E 腳本均未包含此選用按鈕。
  - **現在怎麼做**：維持單一預切原始碼診斷管線，不加沒有驗收覆蓋的 `"Deep Tool Inspect"` 按鈕（避免被 Ticket `03` YAGNI 審查直接砍除）。
  - **沒選的做法會怎樣**：若在 Ticket `03` 額外寫一套多輪 `ChatSession` tool-calling UI 與 mock tools，因不在 Ticket `03` 的 4 條驗收清單內，跑 `ticket-yagni-runner.py` 時會被判為 `kill` 或 `demote` 而白做工。
- **規格缺口**：`.scratch/flow-witness/spec.md` 第 47 行保留了 optional Deep Tool Inspect 的描述，但未列入 Ticket `01..03` 的驗收條件。
- **影響範圍**：`src/components/storyboard.tsx`、`src/lib/verification-pipeline.ts`。
- **判定**：`needs-user` — 若你希望在錄製展示影片前補上這顆選用的 `ONLY_IN_CLOUD` Deep Tool Inspect 按鈕展示 Function Calling，可隨時加回；暫定做法為保持目前通過 YAGNI 審查的精簡三拍介面（撤回方式：於 `firebase-cloud.ts` 與 `storyboard.tsx` 補上 `declarations: [getComponentSource, getDesignTokens]` 呼叫按鈕）。
- **把握度**：中

#### C10：在 `scripts/verify_routing_e2e.mjs` Scenario 2 的初始化腳本中主動 `delete window.LanguageModel`
- **何時**：Ticket `03` E2E 驗證（commit `4651516`，`scripts/verify_routing_e2e.mjs:139-142`）
- **決定**：在 Scenario 2（驗證無 `window.LanguageModel` 瀏覽器的 `ONLY_ON_DEVICE` 阻斷行為）透過 `context.addInitScript` 刪除 `window.LanguageModel`。
  - **觸發事件**：Playwright `1.64.1` 隨附的 `HeadlessChrome/151.0.7903.2` 在 `http://127.0.0.1` 預設暴露了一個內建的空殼 `window.LanguageModel`（`availability()` 回 `'downloadable'`，`create()` 後變 `'available'`，但 `prompt()` 只會原樣回音輸入文字），導致未加 `addInitScript` 時瀏覽器並非「沒有 `window.LanguageModel`」。
  - **現在怎麼做**：在 `scripts/verify_routing_e2e.mjs:139-142` 加上 `context.addInitScript(() => { delete window.LanguageModel; })`，精確重現「不支援 Built-in AI 的一般瀏覽器」前置條件。
  - **沒選的做法會怎樣**：若不刪掉 HeadlessChrome 151 的內建回音 stub，Scenario 2 會去呼叫那個只會回音 prompt 原文的假物件，最終拿到 `ON_DEVICE_SCHEMA_PARSE_FAILURE` 而非票檔要求的 `CONFIDENTIAL_MODE_ADAPTER_MISSING`，無法測到真正的缺 adapter 阻斷路徑。
- **規格缺口**：撰寫規格時假設無頭 Chromium 沒有 `window.LanguageModel` 全域物件，未預料到 Chromium 151 已內建回音 stub。
- **影響範圍**：`scripts/verify_routing_e2e.mjs:139-142`。
- **判定**：`sound` — 只在測試環境精確建立驗收項指定的前置條件，不放寬任何斷言。
- **把握度**：高
