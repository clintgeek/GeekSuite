# NoteGeek: Local-First AI Inference with OpenRouter Fallback

*Status: **PARKED 2026-11-14** — Chef replaced this with AUTO_TRANSCRIBE_SPEC.md (automatic
transcription through the existing OpenRouter path) before any code was written; the
transformers.js install was backed out. Kept for when on-device inference comes back.*

*Original status: SPEC from Chef, 2026-11-14. Design APPROVED for the spike the same day, with
Chef's changes (see "Decisions" — they override the draft where they differ). Scope is
the technical spike (§6) only.*

---

## The spec (as given)

### Objective

Implement a reusable inference architecture for NoteGeek that prioritizes local device
hardware, particularly GPU acceleration, and falls back to OpenRouter when the local device
cannot reasonably execute the requested workload.

The primary initial use case is handwriting recognition and sketch interpretation, but the
architecture should support other inference workloads in the future.

### 1. Execution Priority

1. **Local GPU (preferred)**
   - Detect WebGPU availability in the browser.
   - Determine whether the device has sufficient resources to run the selected model.
   - Execute inference locally using an appropriate browser-compatible ML runtime.
   - Keep inference off the UI thread.
2. **OpenRouter (fallback)**
   - If local GPU execution is unavailable, unsupported, or unsuitable for the workload, use
     the configured OpenRouter vision/model endpoint.
   - Do not attempt to run a model locally if doing so would create unacceptable memory
     pressure, performance degradation, or battery consumption.
   - Make cloud fallback observable to the user.
3. **Failure handling**
   - If neither execution path is available, report that inference could not be completed.
   - Never silently discard work.
   - Never silently change execution providers during an active operation.

### 2. Hardware Capability Detection

Build capability detection around actual browser/runtime capabilities, not device names or
user-agent strings. Evaluate: WebGPU availability; GPU adapter availability and reported
capabilities; model compatibility with the available runtime; available memory where it can
be reasonably estimated; model size and expected inference requirements. Do not assume that
WebGPU availability guarantees sufficient hardware. WebNN/NPU support can be investigated
separately, but is not a prerequisite. WASM/CPU execution may be evaluated as a future
option, but should not replace the GPU-first/OpenRouter-fallback behavior without
discussion.

### 3. Inference Abstraction

A provider-independent inference interface; the caller does not know whether inference ran
locally or through OpenRouter. Supports: provider selection, model selection, capability
assessment, request cancellation, execution status and progress, error reporting, execution
metadata. Consistent structured results regardless of provider. Metadata: provider (local
GPU or OpenRouter), model and model version, execution duration, whether fallback occurred,
recognition confidence where supported.

### 4. Privacy and User Control

This changes the existing privacy boundary, so handle it explicitly.
- Local inference must never transmit note contents.
- OpenRouter fallback sends the relevant note content or sketch image outside the local server.
- Provide a user-configurable cloud fallback setting.
- Make it clear when content is being sent to OpenRouter.
- If cloud fallback is disabled, fail gracefully rather than transmitting content.
- Do not introduce any other cloud provider or automatic provider substitution.
- Keep API credentials server-side. Never expose OpenRouter API keys to the PWA.

The existing local-only indexing behavior must remain unchanged unless the user explicitly
enables the new inference fallback behavior.

### 5. Model Management

Avoid hard-coding a particular model into the architecture. Investigate models for
handwriting recognition and sketch interpretation, compared on: recognition accuracy against
actual NoteGeek handwriting; model size and download requirements; GPU compatibility;
browser runtime compatibility; memory consumption; inference latency. Keep model downloads
versioned and cacheable.

### 6. Initial Scope — a technical spike, not a broad implementation

Demonstrate:
1. WebGPU detection on the Lenovo and Samsung endpoints.
2. Local execution of a representative handwriting recognition model.
3. OpenRouter fallback when local execution is unavailable or unsuitable.
4. Consistent output from both providers.
5. Correct privacy behavior and visible provider identification.

Use a representative collection of actual NoteGeek sketches for accuracy and performance
evaluation.

### 7. Acceptance Criteria

- Local GPU is preferred whenever the device can reasonably execute the model.
- OpenRouter is used only when local execution is unsuitable and cloud fallback is enabled.
- No note content is transmitted during local execution.
- OpenRouter credentials never reach the client.
- Provider selection and fallback are observable.
- The UI remains responsive during local inference.
- Failed or interrupted inference does not lose the original sketch.
- Existing server-side indexing and semantic search continue working unchanged.

Before implementing, inspect the existing NoteGeek handwriting conversion, OpenRouter
integration, and background indexing architecture. Present the proposed design and any
necessary changes before expanding scope.

---

## What exists today (inspected 2026-11-14)

- **Convert handwriting to text** (HANDWRITING.md §2). The client exports the page as a
  white-flattened PNG, ≤ 2000 px, ≤ 6 MB, and calls basegeek's
  `transcribeSketch(image, mediaType, source)`. The gateway runs
  `runAIFeature({ app: 'notegeek', feature: 'transcribe', need: 'vision+prose:balanced' })`,
  and vision routes only through OpenRouter. Limits: 40 per user per UTC day, 45 s timeout,
  temperature 0. It returns `{ text, provenance }`. It is user-initiated, every result is
  reviewed in a dialog, and it never writes to the sketch.
  → **This is already the spec's OpenRouter path**, with the key server-side and
  provenance returned. Reuse it; don't rebuild it.
- **Background indexing** (basegeek `graphql/notegeek/indexer.js`, `chunking.js`,
  `embeddings.js`). A server-side worker embeds note text with the local
  `datageek_embeddings` (mxbai-embed-large) about 30 s after the last edit. Sketches
  (`handwritten`) contribute their **title only**; their content is a tldraw snapshot.
  Hard rule: note text goes to that container and nowhere else.
- **The sketch keeps its strokes**: tldraw `draw` shapes with point lists, in page
  coordinates. Typed text (text, note and geo labels) is plain text in the same snapshot.
- **PWA cache**: Workbox precache, 4 MB per-file limit. Model weights must not be
  precached.
- **The hardware split**: the server (4 cores, no GPU) does the indexing; the GPU is in the
  device holding the pen. Local inference can therefore run only while NoteGeek is open on
  a capable device.

## Decisions (Chef, 2026-11-14)

**Target devices.** Lenovo Idea Tab Pro Gen 2 (TB390FU), Android 16; Samsung Galaxy S26
Ultra, Android. Browser versions are unknown, and **the diagnostics page collects them**.
The Lenovo is not a Chromebook, so the ChromeOS Handwriting Recognition API is a separate
investigation and **not part of the architecture**.

| Question | Decision |
|---|---|
| OpenRouter fallback default | **Off**, explicitly, until the user enables it |
| 10–20 real reference transcripts | Yes. Real sketches, never synthetic benchmarks |
| Model downloads | Hugging Face for the spike; self-hosted for production |
| Diagram interpretation | Later |
| Diagnostics | On both devices |

**Chef's three changes to the draft:**

1. **Don't overestimate hardware detection.** WebGPU reports adapter capabilities and
   limits, but not available GPU memory, and browser memory reporting is inconsistent. So
   capability detection is a *pre-filter*, never a verdict. Suitability is decided by real
   inference runs (the timed warm-up plus actual tests) **and observed memory pressure**
   (device-lost and out-of-memory errors, JS heap growth where Chrome reports it).
2. **Segmentation is its own problem, measured on its own.** Which strokes form a line,
   reading order, and annotations or diagrams beside the text are all separate from
   recognition. The eval scores segmentation separately from OCR: OCR on hand-cut
   reference lines vs OCR on our segmenter's lines. Otherwise a segmentation mistake gets
   blamed on the model.
3. **Prove the full browser path first.** Before any dataset work, show the candidate
   model loads and runs on both Android browsers through the intended runtime. That covers
   architecture support, the ONNX conversion, WebGPU operator coverage (including ops that
   fall back to CPU) and quantization.

**Architecture point, confirmed:** the sketch stays the source of truth, and the extracted
text is *derived, searchable metadata*. The server receives a transcript with provenance
and never needs to know which device, or OpenRouter, produced it.

## Proposed design (approved for the spike; Decisions above take precedence)

### A. Where recognition runs, and what leaves the device

```
 device (PWA)                                   basegeek (this box)           outside
 ┌───────────────────────────────┐   text only  ┌──────────────────────┐
 │ inference client              │ ───────────▶ │ saves sketchText     │
 │  ├ local-webgpu provider      │              │ indexer → embeddings │
 │  │   (Web Worker, ONNX/WebGPU)│              │ (unchanged path)     │
 │  └ openrouter provider ───────┼── PNG ─────▶ │ transcribeSketch ────┼──▶ OpenRouter
 └───────────────────────────────┘ (only if     └──────────────────────┘   (key stays here)
                                    allowed)
```

- **Local**: the image never leaves the device. Only the recognised **text** goes to our
  own server, the same way the sketch itself is saved, and the indexer embeds it on-box as
  today. Model weights are *downloaded* (from our own origin once mirrored, from Hugging
  Face during the spike). Nothing about the note is sent to fetch them.
- **OpenRouter**: the existing `transcribeSketch` mutation, unchanged. The client never
  holds a key.

### B. The interface (`frontend/src/inference/`)

```js
const client = createInferenceClient({ providers: [localWebGpu, openRouter] });

await client.assess('handwriting')      // → [{ provider, model, ok, reason }]  (no work done)
const job = client.run('handwriting', { sketch }, { allowCloud, signal, onProgress });
// onProgress: { phase: 'download'|'load'|'infer', loaded, total }
const result = await job;
// → { text, lines?: [{ text, confidence, bbox }],
//     meta: { provider: 'local-gpu'|'openrouter', model, modelVersion,
//             durationMs, fellBack: boolean, confidence: number|null } }
```

- **The provider is chosen once, before work starts** (`assess` → first `ok` in priority
  order). If a local run then fails mid-way, the job **fails** and says so. It does not
  quietly switch. The UI offers "Try with OpenRouter" as a separate, explicit run, and
  that run's result has `fellBack: true`.
- **Cancellation**: `AbortSignal`. A local run terminates its worker. A cloud run aborts
  the fetch; the server call may still finish and count against the daily cap.
- **Errors** are typed: `Unavailable`, `Unsuitable(reason)`, `CloudNotAllowed`,
  `Cancelled`, `Failed(cause)`. Each carries the provider it came from.
- **The sketch is never touched** by any of this. Results are text beside the sketch, so
  an interrupted run loses nothing.

### C. Capability assessment (per model, never per device name)

1. `navigator.gpu` present → `requestAdapter()` returns non-null.
2. Adapter limits cover the model manifest's needs (`maxBufferSize`,
   `maxStorageBufferBindingSize`), plus the `shader-f16` feature if the model's weights
   are fp16.
3. Memory: `navigator.deviceMemory` (Chrome, coarse: 2/4/8 GB) against the manifest's
   estimate. If unknown, treat it as "probably fine" and let step 4 decide.
4. **A measured warm-up**: the first time a model runs on a device, it times one small
   inference. If that exceeds the manifest's budget, the model is marked unsuitable *on
   that device*. The verdict is cached per device and model version (localStorage) and can
   be reset from the labs page.
5. Battery (`navigator.getBattery`, where it exists): not charging and under 20% →
   unsuitable for *background* work. A run you start yourself still goes ahead.

### D. Model management

- A **manifest** (`inference/models.js`): `{ id, task, version, files[], sizeBytes,
  runtime: 'onnx-webgpu', dtype, needs: { f16, maxBufferSize, memGB }, budgetMs,
  preprocess }`. Code names a *task*; the manifest picks the model.
- Weights live in a **versioned Cache Storage bucket** (`ng-models-<id>@<version>`),
  outside the Workbox precache. A new version downloads beside the old one, and the old
  one is deleted only after the new one loads.
- Runtime: `@huggingface/transformers` v3 (onnxruntime-web, WebGPU backend). It is
  **lazy-loaded inside the worker**, so the app's normal bundle doesn't grow.

### E. Candidates for the spike

| Model | Reads | Size (q8 / fp16) | Notes |
|---|---|---|---|
| **TrOCR-small-handwritten** | one line | ~65 MB / ~120 MB | IAM-trained English handwriting. Line-level, so it needs line splitting. We can do that **from the strokes** (cluster stroke bounding boxes by y), rendering each line on its own. Likely the best accuracy per MB. |
| TrOCR-base-handwritten | one line | ~350 MB / ~670 MB | More accurate, heavier; worth it only if small falls short. |
| Florence-2-base (OCR task) | whole page | ~250 MB | Page-level with no line splitting; transformers.js supports WebGPU. Generally weaker on handwriting. |
| SmolVLM-500M / Qwen2-VL-2B | page + "describe the diagram" | 0.5–2+ GB | The only family that also does **sketch interpretation**. Heavy for a tablet, and the hallucination risk is real. Spike only if interpretation is in scope now. |
| Chrome Handwriting Recognition API | strokes | 0 (built into the OS) | On-device and stroke-based, so likely the most accurate. ChromeOS only today: worth it if the Lenovo is a Chromebook. |

Recommendation: spike **TrOCR-small** (with stroke-based line splitting) against
**Florence-2-base**, with OpenRouter as the reference. Defer VLM "sketch interpretation"
until the text path is proven.

### F. Privacy setting and visibility

- New NoteGeek setting, **"Reading handwriting"**:
  - *On this device only* (default). Never sends a sketch out; if the device can't run the
    model, the sketch stays title-searchable as today.
  - *On this device, OpenRouter if needed*. Explicit opt-in, with the line "Sketch images
    are sent to OpenRouter when this device can't read them."
- The **manual Convert** command keeps working as it does today (user-initiated, reviewed),
  but now tries the device first. Whenever it would use OpenRouter, the review dialog says
  so *before* sending ("This device can't read handwriting. Send this page to OpenRouter?").
- Every result shows its provider: "Read on this device · TrOCR small · 1.8 s" or "Read by
  OpenRouter · <model>".
- Automatic (index-time) recognition never uses OpenRouter unless the opt-in is on.
  Existing indexing is unchanged until then.

### G. After the spike — search integration (not in this scope; sketched for context)

The sketch gains `sketchText` and `sketchTextFor` (a hash of the strokes it was read from),
plus the provenance. When the strokes change, the hash goes stale and the device re-reads
the sketch the next time it is open and idle. `chunking.js` reads `sketchText` for
`handwritten` notes. Server indexing, embeddings and the on-box rule stay as they are.

### H. The spike, step by step (each its own commit)

0. **Browser/model compatibility proof** (Chef's change 3). On the `/labs/inference` page:
   load each candidate through transformers.js on WebGPU in a worker, run it on a fixed
   sample image, and report success or failure, the error text, load and inference times,
   and the same run on WASM for comparison. If a model doesn't run on both Android
   browsers, it is dropped before any dataset work.
1. **Diagnostics** on the same page: browser and version (`userAgentData` high-entropy
   values, with the UA string recorded as data, never used for decisions), WebGPU adapter
   info and limits, `shader-f16`, deviceMemory, hardware concurrency. Copyable as JSON for
   the write-up. Run on the Lenovo and the Samsung.
2. **Inference client + OpenRouter provider** wrapping `transcribeSketch`. Cloud fallback
   is OFF and can only be enabled explicitly. No behaviour change anywhere else.
3. **Local provider** for whichever model passed step 0, with **stroke segmentation as a
   separate module** (strokes → ordered lines) that has its own tests.
4. **Eval** over Chef's 10–20 real sketches, with three scores per device: segmentation
   (line grouping and reading order against the reference), OCR on reference lines, and
   end-to-end. Plus latency (cold and warm), download size, and memory-pressure events.
5. Write up the results; Chef picks the model and decides on §G.

### Open questions for Chef (answered 2026-11-14 — see Decisions)

1. What exactly are the **Lenovo** and **Samsung** endpoints (model, OS, browser)? The probe
   in step 1 answers the WebGPU half either way.
2. Should **cloud fallback default to off**? (Recommended: yes, which keeps today's rule.)
3. **Ground truth**: 10–20 real sketches with correct transcripts. The quickest route is
   Convert on each, then fix the text in the review box. About 15 minutes of Chef's time.
   The spike reads them from Mongo read-only.
4. **Model weights**: fetched from Hugging Face during the spike, then mirrored on our own
   origin for real use? (Recommended.)
5. **Sketch interpretation** (diagrams, not just words): in the spike, or after the text
   path is proven? (Recommended: after.)
