# FlowWitness — 瀏覽器原生混合式 UI 與狀態驗證工作台

[線上互動工作台 (`firebase-flow-witness.vercel.app`)](https://firebase-flow-witness.vercel.app) · [42 秒展示影片 (`youtu.be/2H3QmFD4D20`)](https://youtu.be/2H3QmFD4D20) · [English Documentation](/README.md) · [領域術語表](/docs/glossary.md) · [ADR-0001：混合推論閘道與雙端 Schema 編譯器](/docs/decisions/0001-hybrid-inference-gateway-and-schema-compiler.md) · [ADR-0002：轉場快照對與預切原始碼升級](/docs/decisions/0002-transition-snapshot-pair-and-pre-sliced-escalation.md) · [Devpost 參賽說明書](/devpost/DEVPOST_SUBMISSION.md)

**FlowWitness** 是為 [Google #BuildHybridAI 2026 黑客松](https://firebasehybridaihackathon.devpost.com/)打造的瀏覽器原生混合式 UI 與狀態驗證工作台，採用官方 [Firebase AI Logic Web SDK](https://firebase.google.com/docs/ai-logic/hybrid-in-cloud-on-device)（`firebase/ai` v13.x+ / `@firebase/ai@3.0.0`）與 [Firebase App Check](https://firebase.google.com/docs/app-check)。

多數參賽作品僅將 Chrome 內建的端側 Gemini Nano（`window.LanguageModel`）當成斷網時的備援；**FlowWitness** 則將「窄判官（`Jev` 式高速初篩）」與「深模型（雲端根因修補）」結合為三拍驗證閉環：

1. **Beat 0 — 確定性像素與 DOM 差集（`0 ms`）**：以 `pixelmatch({ threshold: 0.1, includeAA: false, diffMask: true })` 確定性濾除純字型抗鋸齒雜訊，擷取 DOM 狀態變化，並將剩餘變動區塊聚類為單張 `<= 384×384 px` 編號合成圖（僅耗用 `1` 個 Gemini 影像 tile = `258` tokens）。
2. **Beat 1 — 端側 Gemini Nano 語意初篩（`PREFER_ON_DEVICE` / 機密模式 `ONLY_ON_DEVICE`）**：在瀏覽器本地透過雙端編譯的 `TriageVerdictSchema`（`benign_transition | false_green_persistence_lie | layout_or_token_break | unsure`）判別轉場結果。良性時間戳記與抗鋸齒變動在端側直接消融（`$0` 雲端費用、`0` 全螢幕截圖外傳）；僅在偵測到「假綠燈持久化謊言」、「排版／Design Token 崩壞」或端側自評 `unsure` 時才升級雲端。
3. **Beat 2 — 雲端 Gemini 根因診斷與一鍵修補重驗（`PREFER_IN_CLOUD`）**：將升級案例連同確定性預切元件原始碼（`<= 80` 行）送交雲端 Gemini 定位行號與修補碼。點擊 **Apply Patch & Re-Verify** 即可並排預覽修補後畫面並透過 Beat 0 驗證差異像素與區域歸零（無需重複發送 Beat 1 模型請求），確認矛盾歸零。同時提供 **Bring Your Own Snapshot / Code Dropzone** 供開發者日常檢測自家專案。

---

## 三臂基準評測結果（12 組真實標籤 `caseMatrix`）

透過 [src/core/flow-witness-engine.ts](/src/core/flow-witness-engine.ts) 的 `evaluateBenchmarkMatrix()` 對 `12` 組轉場案例（`6` 組真實缺陷 + `6` 組良性對照組）進行三臂對照：

| 評測組別 | 缺陷召回率（Recall） | 精確率（Precision） | 良性雜訊濾除率 | 雲端呼叫次數 | 雲端呼叫節省率 |
| --- | --- | --- | --- | --- | --- |
| **Arm 1：純確定性像素／DOM 規則基線** | `100.0%` (`6/6`) | `50.0%` (`6/12`) | `0.0%` (`0/6`) | `12` | `0.0%` |
| **Arm 2：單獨使用端側 Gemini Nano 初篩** | `100.0%` (`6/6`) | `85.7%` (`6/7`) | `83.3%` (`5/6`) | `0` | `100.0%` |
| **Arm 3：FlowWitness 完整混合架構** | **`100.0%` (`6/6`)** | **`100.0%` (`6/6`)** | **`100.0%` (`6/6`)** | **`7`** | **`41.7%`** |

---

## 快速啟動與自動化驗證

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify:e2e
```

- 屬性測試與單元測試位於 [tests/flow-witness-engine.test.ts](/tests/flow-witness-engine.test.ts) 與 [tests/studio-model.test.ts](/tests/studio-model.test.ts)。
- 無頭瀏覽器 E2E 驗證腳本位於 [scripts/verify_routing_e2e.mjs](/scripts/verify_routing_e2e.mjs)；跑之前請在沒有 `.env.local` 的狀態下 build，腳本驗的是「沒有 Firebase 設定」的確定性路徑。

### 接上 Firebase AI Logic（選用）

建立 `.env.local` 並填入 `NEXT_PUBLIC_FIREBASE_API_KEY`、`NEXT_PUBLIC_FIREBASE_PROJECT_ID`、`NEXT_PUBLIC_FIREBASE_APP_ID`（要啟用 App Check 再加 `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`），然後重新 build。Firebase 只會在第一次呼叫雲端時初始化，頁面載入時不會連線。

沒有填這些值時雲端層關閉：Gemini Nano 仍在端側回答；沒有任何模型能回答的步驟，會顯示預錄判決並標示 **Deterministic Replay (No Firebase Env)**，收據記錄 `actualInferenceSource: "none"` 與 `0` 次雲端呼叫。

---

## 授權條款

本專案採用 [Apache License 2.0](/LICENSE) 授權。
