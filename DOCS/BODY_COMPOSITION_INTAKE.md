# FitnessGeek — Body Composition Intake

How an Arboleaf smart-scale body-composition scan gets from the scale into FitnessGeek,
what of it we store, and why most of the report is deliberately thrown away.

Written 2026-09-16 during the build. Status of each piece is tracked in §8.

---

## 1. Why this exists

FitnessGeek's `Weight` model stores exactly one number. The Arboleaf scale produces a
full body-composition scan — roughly fifty printed values — and the app had nowhere to
put any of it.

The obvious integration paths do not work:

- **Garmin Connect exports, it does not ingest.** It will not accept a third-party
  scale's body composition. `garminConnectService.js` already pulls `weightLbs` and
  pushes weight back; that is the whole surface, and it is not extensible to this.
- **Health Connect is lossy.** It carries `Weight`, `BodyFat`, `BoneMass`,
  `LeanBodyMass`, `BodyWaterMass` and `BasalMetabolicRate` — so it drops protein,
  skeletal muscle, subcutaneous and visceral fat, and **all ten segmental values**,
  since neither Health Connect nor Garmin has per-limb fields at all. Bridging
  Arboleaf → Health Connect → anything buys a worse copy of what the report already
  contains.

The only lossless source is the report the Arboleaf app itself produces, which it can
share as a PDF or a PNG. So the report *is* the integration.

The cadence argument follows from that: sharing a file from the scale app is less work
than typing a weight by hand, so in practice most weigh-ins will carry a full scan.
This is not an occasional bulk-import path. It is the normal one.

---

## 2. Intake architecture

```mermaid
flowchart LR
    Scale["Arboleaf app<br/>(PDF or PNG report)"]
    subgraph Front [Front doors]
        AND["Android share sheet<br/>(Web Share Target)"]
        IOS["iOS Shortcut<br/>or file picker"]
        DESK["Desktop file picker<br/>/ drag-drop"]
    end
    EP["POST upload endpoint<br/>(auth + CSRF + sniff + size)"]
    EX["Extraction<br/>(aiGeek, need: vision)"]
    GATE["Arithmetic validation gate"]
    DB[("BodyComposition<br/>+ join to Weight")]
    CONF["Confirm screen<br/>(on mismatch)"]

    Scale --> AND & IOS & DESK --> EP --> EX --> GATE
    GATE -->|recomputation agrees| DB
    GATE -->|mismatch| CONF --> DB
```

The endpoint is deliberately dumb: it accepts `multipart/form-data` with a file and does
not care who sent it. Every platform difference is therefore a client-side difference
only, which is what keeps the iOS gap (§3) from becoming an architectural one.

---

## 3. Platform support — the share sheet is Android-only

**Safari implements Web Share, not Web Share Target.** `navigator.share()` works on iOS,
so a web app can push *out* to the share sheet. The inbound half — registering a PWA as a
destination that appears *in* the sheet — has never shipped in WebKit. An installed iOS
PWA simply does not appear as a target.

| Platform | Front door | Notes |
|----------|-----------|-------|
| **Android** | `share_target` in the manifest → POST | The intended path. Requires the PWA to be installed. |
| **iOS** | An iOS Shortcut registered to the share sheet, POSTing to the same endpoint | Restores share-sheet behaviour. One-time per-device setup. |
| **iOS, no setup** | `<input type="file">` in-app | Works in Safari today. Arboleaf saves to Files, user picks it. Two extra taps. |
| **Desktop** | File picker / drag-drop | Also the re-import path for old scans. |

The file picker is not a consolation prize — it is wanted anyway, for desktop and for
re-importing a scan that was missed. Build it regardless of platform.

*Verify against WebKit release notes before assuming this is still true — it is exactly
the kind of gap that eventually closes.*

---

## 4. Which file to send

**Send the PDF.** Both formats carry identical numbers, but:

| | `arboleaf.pdf` | `arboleaf.png` |
|---|---|---|
| Real format | PDF 1.4, 2 pages, **no text layer** (each page is a single embedded image at 76 ppi) | **JPEG** despite the extension |
| Dimensions | 1714 x 2797 (page 1 carries the complete dataset) | 1080 x **10037** |
| As vision input | One image, no preprocessing | Must be sliced server-side first |

That last row is the operative one. Vision APIs downscale to a maximum long edge
(Claude's is ~1568 px), so a 10 037 px-tall screenshot arrives at the model roughly 6x
reduced and the text is unreadable. It cannot be sent as a single image — reading it
during design required slicing it into 8 chunks.

Accept both formats, since Arboleaf offers both and users will send either. Detect the
tall screenshot and slice it; pull page 1's image out of the PDF (§4.1 — which is not
quite "straight through", because of what the PDF actually stores).

**Do not trust the file extension.** The sample file named `arboleaf.png` is JPEG data.
Sniff content.

### 4.1 What the PDF actually contains — measured, not assumed

Page 1's image XObject is **`/FlateDecode`**, `/ICCBased` with 3 components, 8 bits per
component, 1714 x 2797, no predictor. That matters because a `/DCTDecode` stream's bytes
*are* a JPEG file and can be handed to a model untouched, while a FlateDecode one is a
bare grid of colour samples with no header and no format — it has to be inflated and
re-encoded.

The first implementation assumed DCTDecode, passed its synthetic fixture, and failed on
the real vendor file. Both paths are now handled and both are exercised against real
files. Measured results:

| Input | Output | Total base64 |
|---|---|---|
| `arboleaf.pdf` | 1 image, re-encoded JPEG q90 | **1.03 MB** |
| `arboleaf.png` | 8 slices | **2.40 MB** |

Both sit inside the 6 MB request budget, and the PDF is the better input on every axis:
one image instead of eight, less than half the payload, no slicing. The re-encoded page
was checked by eye — every printed figure, including the small segmental numbers, is
legible.

Unsupported terminal filters (JPXDecode, CCITTFaxDecode) and colour layouts that are not
1- or 3-component 8-bit fail with a specific error telling the user to share the image
export instead. The re-encode never guesses at a stride: a mis-strided buffer is still
valid base64 and would hand the model a picture of noise to hallucinate over.

---

## 5. What we store, and what we throw away

The scale measures exactly two things: weight (load cells) and bioelectrical impedance.
Every other number on the report is a regression or an arithmetic consequence. The rule
for storage is therefore:

> **Store a value only if it cannot be recomputed exactly from the other stored values.**

### 5.1 Stored — whole body (8)

| Field | Unit | Sample |
|---|---|---|
| `weight_value` | lb | 317.2 |
| `body_fat_mass_lb` | lb | 140.2 |
| `body_water_l` | **L** (not lb — the report gives litres) | 59.4 |
| `protein_lb` | lb | 33.6 |
| `bone_mass_lb` | lb | 12.4 |
| `skeletal_muscle_lb` | lb | 102.4 |
| `subcutaneous_fat_lb` | lb | 112 |
| `visceral_fat_index` | **unitless index, not a mass** | 20 |

The last two are easy to mistake for derived values and are not. Subcutaneous fat looks
like `total_fat - visceral_fat`, but visceral fat is printed as an *index*, not a mass, so
that subtraction is impossible — subcutaneous is an independent regression output.

### 5.2 Stored — segmental (10)

Five segments (`left_arm`, `right_arm`, `trunk`, `left_leg`, `right_leg`), each with
`muscle_lb` and `fat_lb`.

These are real measurements, not decoration: SMI reproduces exactly from the four limb
muscle values (§5.4), which means this is an 8-electrode scale and the per-limb figures
are measured rather than modelled. **Nothing downstream of the report carries them** —
neither Garmin nor Health Connect has per-limb fields — so if they are not captured here
they are lost.

### 5.3 Thrown away

Every percentage (each is just `value / weight`), fat-free mass, muscle mass, BMI, BMR,
SMI, and the whole-body "normal range" columns — all recomputed on read per §5.4.

Also discarded, permanently:

- **Metabolic age, fitness score, body type** — proprietary marketing composites.
- **The "compared to normal" segmental column.** It prints 923.3%, 900.8%, 746.4%,
  438.6% against limb fat. Those are not plausible at any body composition, and the PDF's
  own left panel prints the same figures, so it is a scaling bug in Arboleaf's report
  generator rather than a render artifact. It is a comparison ratio, not a measurement;
  dropping it costs nothing.
- **Waist-hip ratio (1.3).** A scale cannot measure this. It is a model estimate or a
  stale manual entry. Do not import it.
- **Obesity level, obesity %, health score, target weight, the three "control" columns**
  (xlsx only) — the same class as metabolic age: vendor composites or recommendations
  computed from inputs we already store.

**Kept though it is not a measurement: the device** (`device.name`, `device.mac`, xlsx
only). A different scale reads the same body differently, so a scale swap silently breaks
every trend; this is the only way to tell afterwards. Added 2026-09-22 under Chef's rule
"don't toss any data that isn't pure noise" — everything else above is either recomputable
from what we store or not information about the body.

### 5.4 The derivation table — verified against the real scan

Every one of these was checked numerically against the 2026-09-16 scan before being
classed as derived:

| Derived value | Formula | Computed | Printed |
|---|---|---|---|
| `fat_free_mass` | `weight - body_fat_mass` | 177.0 | 177 |
| `muscle_mass` | `fat_free_mass - bone_mass` | 164.6 | 164.6 |
| `body_fat_%` | `body_fat_mass / weight` | 44.20 % | 44.2 % |
| `body_water_%` | `water_kg / weight_kg` | 41.3 % | 41.3 % |
| `protein_%`, `bone_%`, `skeletal_%` | `value / weight` | — | all match |
| `BMR` | `370 + 21.6 x fat_free_mass_kg` (**Katch-McArdle**) | 2104 | 2105 |
| `SMI` | `appendicular_muscle_kg / height_m^2` | 11.31 | 11.3 |
| `BMI` | `weight_kg / height_m^2` | 44.4 @ 1.80 m | 44.4 |

Two notes that matter for the gate:

- **BMR is not proprietary.** It is plain Katch-McArdle off lean mass. Worth knowing —
  it means the scale's BMR carries no information the stored fields do not.
- **BMI and SMI are height-sensitive.** The scale rounds height to 1.80 m; recomputing
  from a more precise stored height (1.8034 m for 5'11") gives 44.2 rather than 44.4.
  Neither is wrong. The gate must use a tolerance, not equality.

---

## 6. The arithmetic validation gate

Because §5.4 holds, **the report validates its own transcription.** This is what makes
unattended extraction safe enough to run on every weigh-in.

After extraction, recompute the derived values from the extracted primaries and compare
against the values printed on the report:

- **Agreement** → high confidence the extraction is correct; store the primaries.
- **Mismatch** → a misread digit. Route to a confirm screen rather than saving.

Without this gate, a single hallucinated or misread digit enters the history silently and
pollutes every trend built on top of it, with nothing downstream to catch it. With it,
the failure mode becomes a prompt rather than corruption.

Use a tolerance band, not equality: printed values carry one decimal place, and BMI/SMI
additionally depend on height rounding (§5.4).

The gate is worth building even if extraction were done by hand — it catches typos at the
point of entry.

---

## 7. Deduplication

The same physical scan will arrive twice: a user may share the PDF and then the PNG of
one measurement, or re-share the same file after a failure.

**A file hash is the wrong key** — two different files can represent one measurement
event. Key on `userId` + `measured_at`, where `measured_at` is the scan timestamp printed
on the report (e.g. `09/16/2026 08:01`), which both formats carry. Enforced by a unique
compound index.

Note the UTC Date Separation Principle (`THE_CONTEXT.md` §3.1) applies with force here:

- `measured_at` is an **instant** — full ISO-8601 UTC. It is the dedupe key.
- `log_date` is a **calendar date** — UTC midnight. It is the join key to `Weight`.

They are not interchangeable and both are required.

---

## 8. Known constraints and landmines

- **`BodyComposition` is a separate model, not columns on `Weight`.** Not every weight
  row has a scan behind it — Garmin pushes, travel, manual corrections, and every
  historical row predating this feature. Provenance differs even when cadence matches
  1:1. Join on `userId` + `log_date`.
- **The field set lives in `packages/schemas/fitnessgeek/`.** Two writers persist into
  the same collection and mongoose strict mode silently drops paths one side does not
  know about. See `weight.js`'s header and `DOCS/ARCHIVE/FITNESSGEEK_MODEL_CONSOLIDATION.md`.
  Tripwire parity tests guard it.
- **Keep the service worker out of the share POST.** FitnessGeek is Flavor A
  (VitePWA/Workbox `generateSW`), which cannot express a custom POST fetch handler, and
  `vite.config.js` sets `navigateFallback: '/index.html'`, which would otherwise swallow
  the POST. The share-target action path belongs in `navigateFallbackDenylist`.
  See `DOCS/PWA_STANDARD.md`.
- **The manifest source of truth is `public/manifest.json`.** `vite.config.js` sets
  `manifest: false` deliberately, so VitePWA does not emit a competing manifest and a
  second `<link rel="manifest">`. `share_target` goes in the static file.
- **A share-sheet POST carries no `X-CSRF-Token`.** It originates from the OS, not from
  the app's Axios instance. The repo is at `CSRF_TOKEN=report` and moving to `enforce`
  (`THE_PLAN.md` §2.1), so this must be solved rather than exempted away.

---

## 9. Build status

| # | Piece | Status |
|---|-------|--------|
| 1 | aiGeek vision routing — `input_modalities` captured, flagged on `AIFreeTier`, `vision` filters; catalog deny list narrowed | landed |
| 2 | `BodyComposition` shared schema + both consumers + tripwire registration | landed |
| 3 | Share-target manifest entry, POST endpoint, file-picker fallback | landed |
| 3b | aiGeek image transport + the three `JSON.stringify` fallthroughs above it | landed |
| 4 | Image prep, extraction service, validation gate, confirm screen | landed |
| 5 | Arboleaf `.xlsx` export import (file picker + share sheet) | landed 2026-09-18 |
| 6 | Nextcloud folder import + scale weights into `Weight` (§11) | built 2026-09-22, branch `bodycomp-folder-import` |

### What still needs a human

- ~~Is OpenRouter configured, with a free vision-capable model?~~ **Answered
  2026-09-16: yes.** Of 444 listed models, 22 pass the free-tier filter and 12 declare
  image input; 11 would route for `need:'vision:*'`. One of them
  (`inclusionai/ling-3.0-flash-vl:free`) is reachable only because of the narrowed deny
  exception, and one vision-capable row (`nvidia/nemotron-3.5-content-safety:free`) stays
  correctly denied by `/safety|guard/`.

  Vision routing remains OpenRouter-only (`AIGEEK_CAPABILITY_ROUTING.md` §7.6): the other
  eight providers state nothing about input modality and can never qualify. Free tiers
  churn weekly, so re-run the check rather than trusting the count: fetch
  `https://openrouter.ai/api/v1/models`, pass it through `freeCandidates('openrouter', raw)`,
  and keep the rows whose `architecture.input_modalities` includes `image` and which are
  not denied by a rule other than `VISION_HEAD_PATTERN`.

  Two of the eleven deserve a caveat. `openrouter/free` is the auto-router — it declares
  image input but forwards to whatever it selects, which may not see. `stealth/union-alpha`
  is an unbadged preview that can disappear without notice. Neither is a reason to exclude
  them, but neither is a model whose vision capability is guaranteed by its listing alone.

  No free model here has been checked for quality on dense numeric-table reading, and that
  is deliberately not a blocker: a weak reader produces a gate mismatch (§6) and is stopped
  before it can write wrong numbers into the history.
- **Uploads do not survive a deploy.** They land on container-local disk and fitnessgeek
  has no bind-mounted volume, while every push to `main` restarts the fleet. Harmless
  while extraction is synchronous on the same live container. If it ever goes async, it
  needs a real volume in `docker-compose` — an infrastructure decision, not a code one.
- **WebP tall-image slicing** falls through unsliced (jimp has no WebP decoder). The
  `checked > 0` guard still prevents a bad save. Arboleaf exports JPEG, so this is a
  hypothetical.

### ~~Open question for Chef~~ — answered 2026-09-18

~~Does the Arboleaf app expose a data export?~~ **Yes: a full-history `.xlsx`** (53
columns, every segmental value, exact to the second). It became the primary path in
`cb4f7265` (`services/bodyCompXlsxImportService.js`, tested against the real
`DOCS/body_comp.xlsx`). The vision path stays in place for PDF/PNG reports. §11 adds the
folder import on top of it.

---

## 10. The extraction contract

What the vision model is asked for, and what it is not.

### 10.1 It extracts, it does not compute

The model returns **only** the stored primaries (§5.1, §5.2) plus the derived values
**as printed on the page**. It is never asked to calculate anything.

This matters more than it looks. If the model computed fat-free mass itself, its answer
would agree with our recomputation by construction and the validation gate (§6) would
verify nothing at all. The gate works precisely because the printed column is an
*independent* witness produced by the device, not by the model. Asking the model to
derive would collapse the two witnesses into one.

So: two flat groups in the response — what the scale measured, and what the scale
printed. Both transcribed, neither reasoned about.

### 10.2 Response shape

```jsonc
{
  "measured_at": "2026-09-16T08:01:00Z",  // the timestamp printed on the report
  "height_cm": 180,                        // see §5.4 — centimetres, never the imperial rendering
  "primaries": {
    "weight_value": 317.2, "body_fat_mass_lb": 140.2, "body_water_l": 59.4,
    "protein_lb": 33.6, "bone_mass_lb": 12.4, "skeletal_muscle_lb": 102.4,
    "subcutaneous_fat_lb": 112, "visceral_fat_index": 20
  },
  "segments": {
    "left_arm":  { "muscle_lb": 11,   "fat_lb": 13 },
    "right_arm": { "muscle_lb": 12.4, "fat_lb": 12.6 },
    "trunk":     { "muscle_lb": 86.4, "fat_lb": 74.8 },
    "left_leg":  { "muscle_lb": 28.6, "fat_lb": 17.8 },
    "right_leg": { "muscle_lb": 28.8, "fat_lb": 17.8 }
  },
  "printed": {                             // transcribed, NOT computed — see §10.1
    "fat_free_mass_lb": 177, "muscle_mass_lb": 164.6,
    "body_fat_pct": 44.2, "body_water_pct": 41.3, "protein_pct": 10.6,
    "bone_mass_pct": 3.9, "skeletal_muscle_pct": 32.3,
    "subcutaneous_fat_pct": 35.3, "muscle_mass_pct": 51.9,
    "bmr_kcal": 2105, "bmi": 44.4, "smi": 11.3
  }
}
```

`printed` feeds straight into `validate(doc, printed)`. Anything the model could not read
must come back **absent or `null`, never guessed** — a skipped check is honest, a
fabricated one defeats the gate (`validate()` skips rather than fails on a missing value,
by design).

### 10.3 Height is the one trap

The report displays height in feet and inches. That rendering is lossy, and recomputing
from it produces a spurious BMI failure on a perfectly good scan (§5.4). The model must
return centimetres.

For the reference scan the page prints `Height:5'11"`, and the true value is **180 cm**
— 5'11" is 180.34 cm, which would give BMI 44.2 against the printed 44.4. Where the
report offers only imperial, convert and accept that BMI/SMI may need the wider tolerance
band, or leave `height_cm` null and let those two checks skip.

### 10.4 Which file reaches the model

Per §4: the PDF's page 1 goes through as one image. The PNG must be sliced first — at
1080 x 10037 it is unreadable after a vision API's downscale. Slicing is the caller's
job, before the transport layer.

### 10.5 What happens to the result

1. Validate with `validate(primaries, printed)` from
   `@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation`.
2. `passed` → save, with `extraction.validation_passed: true`.
3. Mismatch → **do not save**; hand the user the confirm screen showing computed vs
   printed per §6, so the disagreement is visible rather than silently resolved.
4. Either way, dedupe on `(userId, measured_at)` (§7) so a re-share is not a new row.

Note `validate()` passes vacuously when everything was skipped, so read `checked` too —
a scan where nothing could be verified is not a scan that verified clean.

---

## 11. Folder import — the Nextcloud drop (2026-09-22)

The Arboleaf app uploads its `.xlsx` export straight into a Nextcloud folder on this box.
FitnessGeek watches that folder and imports new files with no human in the loop. This
section is the design record; the decisions in it are Chef's unless marked otherwise.

### 11.1 Where the files are

- Host path: `/mnt/NextCloud/data/Files/<folder>/` — **one folder per user**. Chef's is
  `clint-imports`.
- Files arrive named like
  `Body Composition-<email>-arboleaf-<YYYYMMDDhhmmss>.xlsx`. The name is not trusted for
  anything: the folder identifies the user and the content identifies the file.
- **An export is a span of history, not one scan**, and spans overlap: the 09-19 file
  carried 6 scans (09-15..09-18), the 09-22 file 3 (09-18..09-22). Re-importing is expected
  and harmless: `BodyComposition`'s `(userId, measured_at)` unique index (§7) turns the
  overlap into `skipped: duplicate`.

### 11.2 How the container sees them

- fitnessgeek's compose mounts `/mnt/NextCloud/data/Files:/imports:ro`. **Read-only on
  purpose.**
- `BODYCOMP_IMPORT_ROOT=/imports` and
  `BODYCOMP_IMPORT_FOLDERS=clint-imports:<userId>[,<folder>:<userId>...]` in
  `.env.production`. Either unset → the watcher is off and says so once at boot.
- A compose change and a new env var both need `docker compose up -d` on the box.
  **A Watchtower redeploy applies neither** (RUNBOOK; the Watchtower env landmine).

### 11.3 Never move, rename or delete the files

Nextcloud keeps its own database of the folder's contents. Changing files behind its back
leaves ghost entries in the Nextcloud UI until someone runs `occ files:scan`. So the mount
is read-only and the record of "already imported" lives in Mongo:
`BodyCompImportFile`, unique on `(userId, sha256)`, holding the filename, status
(`imported` / `failed`), the row counts and the error if any. A file is keyed by content,
not name, so a rename is not a new file and an edited file is.

A `failed` file is not retried until its content changes. Retrying the same bytes produces
the same failure and fills the log.

### 11.4 When it runs

- **At boot, a full scan.** Every push to `main` restarts the fleet, and a watcher does not
  see files that arrived while it was down. The boot scan is the correctness guarantee;
  the watcher only makes it prompt.
- **Then `fs.watch` on each folder**, debounced. Nextcloud writes uploads in pieces, so a
  file is parsed only once its size has stopped changing between two checks. Dotfiles,
  `.part` files and anything that isn't `.xlsx` are ignored.
- **A periodic rescan** (every 15 minutes) as a safety net for any watch event that goes
  missing. Hashing a ~25 KB file is cheap, and the ledger makes it a no-op.

### 11.5 Scale weights become `Weight` rows

Before this, an xlsx import wrote only `BodyComposition`. The weight sat in that row's
`weight_value` and the weight history never saw it. Now every xlsx import (folder,
file picker or share sheet) also writes `Weight`:

- `Weight` gains `source` (`manual` default, `arboleaf_xlsx`) in the shared schema, so an
  imported weight can be told from a typed one.
- One weight per UTC day, `log_date` = UTC midnight — the rule both writers already
  follow.
- **Several scans on one day → the first scan of that day.** (Sage's call: the usual
  weigh-in convention, and a later scan the same evening can't move the day's value.)
- **Chef's rule: when a day has both a manual weight and an import, the import wins.** The
  day's row is overwritten with the scale value and marked `arboleaf_xlsx`; its notes are
  kept. If a day somehow has several rows, one is kept and the rest are removed.
- Only rows that passed the arithmetic gate feed `Weight`, **including rows skipped as
  duplicates**. Those scans were imported before weights were synced, so skipping them here
  would leave their days empty.
- Imported weights are **not** pushed to Garmin. The manual path does that for today's
  entry; a background import pushing historical values is a separate decision.

### 11.6 Open: the gate is tighter than the scale's own rounding

Found running the two real folder exports through the parser and gate (2026-09-22): the
09-19 09:42 scan fails on fat-free mass (computed 176.6, printed 176.4) and muscle mass
(164.2 vs 164.4), each 0.2 lb against a 0.15 tolerance. The scale's printed values disagree
with **each other** — printed FFM 176.4 − bone 12.4 = 164.0, yet it prints muscle 164.4 —
so it derives from unrounded internal values (likely kg) and its rounded columns drift.
Every other real row (8 of 9) passes all 12 checks.

On the xlsx path the gate checks the column mapping, not a reader, and a mis-mapped column
is off by tens of pounds (the Muscle Mass / Skeletal Muscle transposition is 164 vs 102),
not tenths. Awaiting Chef's call on widening the tolerance for `arboleaf_xlsx` only; until
then that scan, and its day's weight, is reported `failed: gate_mismatch` and not saved.

