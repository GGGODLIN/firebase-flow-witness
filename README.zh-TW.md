# FlowWitness — 瀏覽器原生混合式 UI 與狀態驗證工作台

[線上互動工作台 (`firebase-flow-witness.vercel.app`)](https://firebase-flow-witness.vercel.app) · [42 秒展示影片 (`youtu.be/2H3QmFD4D20`)](https://youtu.be/2H3QmFD4D20) · [English Documentation](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/README.md) · [領域術語表](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/glossary.md) · [ADR-0001：混合推論閘道與雙端 Schema 編譯器](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/decisions/0001-hybrid-inference-gateway-and-schema-compiler.md) · [ADR-0002：轉場快照對與預切原始碼升級](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/decisions/0002-transition-snapshot-pair-and-pre-sliced-escalation.md) · [Devpost 參賽說明書](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/devpost/DEVPOST_SUBMISSION.md)

**FlowWitness** 是為 [Google #BuildHybridAI 2026 黑客松](https://firebasehybridaihackathon.devpost.com/)打造的瀏覽器原生混合式 UI 與狀態驗證工作台，採用官方 [Firebase AI Logic Web SDK](https://firebase.google.com/docs/ai-logic/hybrid-in-cloud-on-device)（`firebase/ai` v13.x+ / `@firebase/ai@3.0.0`）與 [Firebase App Check](https://firebase.google.com/docs/app-check)。

多數參賽作品僅將 Chrome 內建的端側 Gemini Nano（`window.LanguageModel`）當成斷網時的備援；**FlowWitness** 則將「窄判官（`Jev` 式高速初篩）」與「深模型（雲端根因修補）」結合為三拍驗證閉環：

1. **Beat 0 — 確定性像素與 DOM 差集（`0 ms`）**：以 `pixelmatch({ threshold: 0.1, includeAA: false, diffMask: true })` 確定性濾除純字型抗鋸齒雜訊，擷取 DOM 狀態變化，並將剩餘變動區塊聚類為單張 `<= 384×384 px` 編號合成圖（僅耗用 `1` 個 Gemini 影像 tile = `258` tokens）。
2. **Beat 1 — 端側 Gemini Nano 語意初篩（`PREFER_ON_DEVICE` / 機密模式 `ONLY_ON_DEVICE`）**：在瀏覽器本地透過雙端編譯的 `TriageVerdictSchema`（`benign_transition | false_green_persistence_lie | layout_or_token_break | unsure`）判別轉場結果。良性時間戳記與抗鋸齒變動在端側直接消融（`$0` 雲端費用、`0` 全螢幕截圖外傳）；僅在偵測到「假綠燈持久化謊言」、「排版／Design Token 崩壞」或端側自評 `unsure` 時才升級雲端。
3. **Beat 2 — 雲端 Gemini 根因診斷與一鍵修補重驗（`PREFER_IN_CLOUD`）**：將升級案例連同確定性預切元件原始碼（`<= 80` 行）送交雲端 Gemini 定位行號與修補碼。點擊 **Apply Patch & Re-Verify** 會把回傳的 RFC 6902 JSON Patch 真正套用到可執行範例，重新執行保存／讀取或版面規則、產生新畫面，再跑 Beat 0 與 Beat 1。無效 patch 會顯示錯誤；若第二次初篩沒有模型回答，只顯示確定性條件的結果。同時提供 **Bring Your Own Snapshot / Code Dropzone** 供開發者日常檢測自家專案。

---

## 三臂基準評測結果（12 組真實標籤 `caseMatrix`）

以下是預錄預期判決的模擬結果，不是真實模型準確率。像素基線由獨立範例重繪計算；Verify Live 另記錄實際 SDK 推論、預錄回放或無模型回答。每題各有對應畫面、DOM 與原始碼。

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

- 屬性測試與單元測試位於 [tests/flow-witness-engine.test.ts](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/tests/flow-witness-engine.test.ts) 與 [tests/studio-model.test.ts](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/tests/studio-model.test.ts)。
- 無頭瀏覽器 E2E 驗證腳本位於 [scripts/verify_routing_e2e.mjs](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/scripts/verify_routing_e2e.mjs)；跑之前請在沒有 `.env.local` 的狀態下 build，腳本驗的是「沒有 Firebase 設定」的確定性路徑。

### 接上 Firebase AI Logic 與必要的 App Check

本機在 `.env.local` 設定；Vercel 在專案 Environment Variables 設定後重新部署：

| 變數 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase 網頁 app API key |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase 專案 ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | 已註冊網頁 app ID |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise site key，允許本機與部署網域 |
| `NEXT_PUBLIC_FIREBASE_AI_MODEL` | 選填；預設 `gemini-2.5-flash-lite` |

舊 `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` 別名仍可用。Firebase Console 需啟用 Gemini Developer API 的 Firebase AI Logic、登記網頁 app 的 App Check，並開啟 App Check enforcement。正式站與評審部署必須使用 reCAPTCHA Enterprise site key，不把 debug token 放進公開環境變數。只有非 production 的 `localhost`／`127.0.0.1`、未配置 site key 時，才接受第一次推論前提供的執行期 `globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN`；token 仍須在相同 Firebase 專案登記。site key 優先，production 會清除 debug flag。

兩個 Beat 都透過官方 `getGenerativeModel()` 呼叫。第一次推論前初始化 App Check，缺少驗證設定時明確失敗。`PREFER_ON_DEVICE` 確認本機可用後，該次採 SDK `ONLY_ON_DEVICE`，不預取雲端 token；其餘可能走雲端的模式先取得 token。機密模式缺少本機模型時在 SDK 前阻擋，不再由應用程式直接呼叫 `LanguageModel.create()` 暖機。

未設定 Firebase 時，兩個模型層都關閉；內建案例只顯示明確標示的 **Deterministic Replay (No Firebase Env)**，來源為 `none`。外部 BYO 圖片沒有預錄判決。

---

## 授權條款

本專案採用 [Apache License 2.0](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/LICENSE) 授權。
