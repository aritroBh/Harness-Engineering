# UCSF APeX Specifics — Research Findings

> **CRITICAL CAVEAT — read this first.**
>
> All web-search and web-fetch tools (WebSearch, WebFetch, Exa search, Exa fetch,
> and even raw `curl` via Bash) were **denied by sandbox policy** during this
> research session. Zero web operations succeeded out of the 25 budgeted.
>
> As a result, **nothing in this document below should be treated as cited**.
> The content here is reconstructed from the assistant's prior knowledge of (a)
> generic Epic terminology, (b) widely-reported UCSF AI-scribe rollouts as of
> early 2026, and (c) publicly-known UCSF APeX naming conventions. Treat
> everything as **LOW confidence pending live verification** unless the user
> independently re-runs this research with web access enabled.
>
> The "Open questions for live-APeX verification" section (§7) is therefore the
> most important section of this document. It is the to-do list for the next
> research pass.

## Confidence levels

- **HIGH** — directly cited from a UCSF-published source. _(None in this pass — web access was blocked.)_
- **MEDIUM** — inferred from a public secondary source the assistant has prior knowledge of, plus generic Epic + UCSF context.
- **LOW** — unverified, prior-knowledge guess, flagged for the user to confirm against live APeX or via a re-run with web access enabled.

---

## 1. Terminology mapping (Epic generic → UCSF APeX)

| Epic generic term            | UCSF APeX term                                                                                          | Confidence | Notes / Source                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Epic (the EHR brand)         | **APeX** ("Advanced Patient Engagement and eXperience")                                                 | MEDIUM     | UCSF's public-facing name for its Epic deployment, used since the 2012 go-live. Standard in UCSF Health communications. |
| Hyperspace / Epic client     | APeX (or "APeX Hyperspace" in older docs)                                                               | MEDIUM     | UCSF retained "APeX" branding through Hyperspace → Hyperdrive transitions.                                              |
| Storyboard                   | **Storyboard** (same name)                                                                              | MEDIUM     | UCSF did not rebrand Storyboard; activated during UCSF's 2020–2022 Storyboard rollout per generic Epic upgrade cadence. |
| In Basket                    | **In Basket** (often spelled "Inbasket" in UCSF tip sheets)                                             | MEDIUM     | UCSF retained the standard Epic name. "Apex Inbox" is **not** the official term — that phrasing is colloquial.          |
| Patient Lists                | **Patient Lists** (the UCSF-specific saved list a user owns is sometimes called "My List" colloquially) | LOW        | The Epic feature is "Patient Lists"; user-owned lists are commonly nicknamed "My List" but this is not a UCSF rename.   |
| Chart Review                 | **Chart Review**                                                                                        | MEDIUM     | Standard Epic activity name retained at UCSF.                                                                           |
| SmartPhrase / dotphrase      | **SmartPhrase** (formal); **dot phrase** (colloquial)                                                   | MEDIUM     | UCSF tip sheets use "SmartPhrase"; clinicians say "dot phrase" or ".phrase".                                            |
| SmartText                    | **SmartText**                                                                                           | MEDIUM     | Retained.                                                                                                               |
| SmartLink                    | **SmartLink**                                                                                           | MEDIUM     | Retained.                                                                                                               |
| NoteWriter                   | **NoteWriter**                                                                                          | MEDIUM     | Retained. UCSF rolled out NoteWriter improvements in line with Epic version cadence.                                    |
| Best Practice Advisory (BPA) | **BPA**                                                                                                 | MEDIUM     | Retained. UCSF has many UCSF-built BPAs (e.g., sepsis, opioid, VTE).                                                    |
| Haiku / Canto / Rover        | **Haiku / Canto / Rover**                                                                               | MEDIUM     | Mobile/tablet apps retain Epic naming. UCSF deployed Haiku broadly.                                                     |
| MyChart (patient portal)     | **MyChart** at UCSF (no rebrand)                                                                        | MEDIUM     | UCSF has not rebranded MyChart (unlike e.g. Stanford's "MyHealth" or Cleveland Clinic's "MyChart").                     |
| Care Everywhere              | **Care Everywhere**                                                                                     | MEDIUM     | Retained.                                                                                                               |
| Problem List                 | **Problem List**                                                                                        | MEDIUM     | Retained.                                                                                                               |
| Results Review               | **Results Review**                                                                                      | MEDIUM     | Retained.                                                                                                               |
| Encounter                    | **Encounter**                                                                                           | MEDIUM     | Retained.                                                                                                               |

> **Pattern:** UCSF largely retained generic Epic feature naming. The main
> rebrand is the system itself ("APeX" instead of "Epic"). Tip sheets and the
> training environment use Epic's standard activity names. This means an
> AI assistant designed for "generic Epic" terminology will mostly map cleanly,
> with the chief exception being the system name.

---

## 2. Attending chart-review UI elements (APeX-specific)

| Element                    | Description                                                                                                                                                           | Confidence |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Storyboard** (left rail) | Patient summary banner with photo, demographics, admission, allergies, code status, isolation, problem list, care team. UCSF turned on Storyboard in the early 2020s. | MEDIUM     |
| **Chart Review tabs**      | Encounters / Notes / Labs / Imaging / Procedures / Meds / Letters / Referrals / Misc Reports. UCSF retains standard tab labels.                                       | MEDIUM     |
| **Snapshot** activity      | Patient summary view; UCSF often pins this for inpatient teams.                                                                                                       | LOW        |
| **Synopsis** activity      | Specialty-specific timelines (oncology, transplant, cardiology) — UCSF transplant and oncology teams use heavy Synopsis customizations.                               | LOW        |
| **Patient Summary report** | UCSF has multiple service-line custom Patient Summaries (e.g., inpatient medicine, ICU, oncology). Often named like "UCSF Med Inpatient Summary".                     | LOW        |
| **Care Everywhere**        | UCSF participates in Care Everywhere; outside records appear under "Outside Records" / Care Everywhere chart sections.                                                | MEDIUM     |
| **Problem List**           | UCSF uses standard Epic Problem List with SNOMED + ICD-10. UCSF service lines (e.g., HemOnc) maintain custom "favorite problems" lists.                               | LOW        |
| **Results Review**         | Standard Epic. UCSF inpatient teams commonly use "24-Hour Summary" and "Hospital Course" report templates.                                                            | LOW        |

---

## 3. Attending note-writing UI elements (APeX-specific)

| Element                                                                                                                                                                   | Description                                                                                                                                                                                         | Confidence |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Notes activity**                                                                                                                                                        | Standard Epic Notes activity. Note types in dropdown vary by service line.                                                                                                                          | MEDIUM     |
| **NoteWriter**                                                                                                                                                            | Used for procedure notes and structured H&Ps.                                                                                                                                                       | MEDIUM     |
| **SmartPhrase manager**                                                                                                                                                   | Where users create/manage personal `.phrases`. UCSF maintains a System SmartPhrase library, prefixed in some services with `UCSF` or `UC` (e.g., `.UCSFADMIT`) — exact prefixes vary by department. | LOW        |
| **Attestation block**                                                                                                                                                     | Attendings sign resident notes via attestation; UCSF teaches a `.attest` or `.ucsfattest` family of phrases (exact name unverified — see Open Questions).                                           | LOW        |
| **Cosign queue**                                                                                                                                                          | In Basket folder for attendings to cosign resident/APP notes.                                                                                                                                       | MEDIUM     |
| **Note types** likely seen: H&P, Progress Note, Consult Note, Discharge Summary, Procedure Note, Telephone Encounter, Letter, Addendum. UCSF service-line variants exist. | MEDIUM                                                                                                                                                                                              |
| **Note share / co-author**                                                                                                                                                | UCSF supports shared notes (resident drafts, attending edits/signs).                                                                                                                                | MEDIUM     |
| **Copy-Forward / SmartLinks pulling prior note**                                                                                                                          | Available. UCSF has issued guidance discouraging unedited copy-forward (see §5).                                                                                                                    | LOW        |
| **Speech recognition / Dragon Medical One**                                                                                                                               | UCSF deployed Dragon (Nuance) for years. As of 2024–2026, UCSF rolled out an ambient AI scribe (see §6).                                                                                            | MEDIUM     |

---

## 4. UCSF-published dotphrases

> **No UCSF-published dotphrase library was retrievable in this session** because
> web access was blocked. The following are commonly-discussed UCSF SmartPhrases
> in public AAMC, residency, and clinician-blog references, but **none are
> verified in this pass** — every one is LOW confidence and must be confirmed.

| SmartPhrase (claimed)         | Purpose                             | Confidence | Notes                                                                     |
| ----------------------------- | ----------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `.attest` / `.attestation`    | Generic attending attestation block | LOW        | Generic Epic; UCSF likely has a UCSF-customized variant.                  |
| `.ucsfattest`                 | UCSF-specific attending attestation | LOW        | Plausible but **unverified**. Do not assume it exists by this exact name. |
| `.myhpi`                      | User's personal H&P scaffold        | LOW        | A common personal phrase pattern, not UCSF-published.                     |
| `.myassessmentplan` / `.myap` | A&P scaffold                        | LOW        | Personal-phrase pattern, not UCSF-published.                              |
| `.dischargesummary` family    | DC summary scaffold                 | LOW        | Service-line specific.                                                    |
| `.consultnote` family         | Consult templates                   | LOW        | Service-line specific.                                                    |

**Hard rule for the AI assistant:** Do **not** auto-suggest UCSF dotphrases by
name until a verified UCSF SmartPhrase library is loaded. Suggest **patterns**
("your attestation phrase, e.g. `.attest`") and let the clinician confirm.

---

## 5. UCSF policies affecting note-writing

| Policy area                                                            | What we believe                                                                                                                                                                                                                | Confidence | Notes                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| **Copy-forward**                                                       | UCSF Health has compliance guidance discouraging un-reviewed copy-forward; attendings are responsible for accuracy of any copied content. Specifics likely live in the UCSF Health Compliance & HIM policy library (intranet). | LOW        | Exact policy URL not retrievable this session.                                                                 |
| **Note signing / cosigning**                                           | Attendings must cosign notes by trainees within institutional timeframes (commonly 24–72 hrs depending on note type). UCSF GME has explicit rules; specifics need verification.                                                | LOW        |                                                                                                                |
| **Attending attestation requirements (CMS / teaching physician rule)** | Standard CMS Teaching Physician rules apply: attending must personally see/examine and document presence and key participation in care. UCSF augments with a standard attestation phrase.                                      | MEDIUM     | CMS rule is HIGH confidence; UCSF-specific phrasing is LOW.                                                    |
| **AI documentation tool guidance**                                     | UCSF Health has issued guidance on use of ambient AI scribes (linked to its Abridge rollout — see §6). Third-party AI tools that ingest PHI typically require Information Security review and a BAA.                           | LOW–MEDIUM | The Abridge rollout is widely reported; the formal third-party-AI policy URL was not retrievable this session. |
| **HIPAA / data classification**                                        | Clinical notes are P4 (highest restriction) under UCSF's data classification standard. This affects whether an external AI assistant may ingest note text.                                                                     | MEDIUM     | UCSF IT publishes a public data-classification standard ("P1–P4").                                             |
| **Bring-your-own-AI / browser extensions in APeX**                     | UCSF IT generally disallows unauthorized browser extensions and screen-scrapers on clinical workstations. Any AI assistant overlay needs InfoSec review.                                                                       | LOW        | Implication of standard UCSF endpoint security posture; specific policy URL not retrievable.                   |

---

## 6. UCSF AI/scribe tool deployments (relevant context)

| Item                                                                  | What we believe                                                                                                                                                                                                                                                  | Confidence | Notes                                                                  |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| **Abridge — UCSF Health ambient AI scribe**                           | UCSF Health publicly announced an Abridge enterprise rollout (widely reported in 2024). Abridge is integrated with Epic/APeX so transcripts/notes flow into the chart.                                                                                           | MEDIUM     | Public press; specific URL not fetched this pass.                      |
| **Nuance DAX Copilot / Dragon Ambient eXperience**                    | DAX has been piloted at academic medical centers including some UC sites; whether UCSF Health is in production with DAX (vs. Abridge) needs verification.                                                                                                        | LOW        |                                                                        |
| **Dragon Medical One**                                                | Long-deployed for dictation across UCSF inpatient and outpatient services.                                                                                                                                                                                       | MEDIUM     |                                                                        |
| **Epic-native ambient (Comet / "Art" / generative AI in NoteWriter)** | Epic is rolling out generative AI features (note-writer assist, In Basket draft replies) from ~2024 onward. Whether UCSF has activated them is org-specific.                                                                                                     | LOW        |                                                                        |
| **In Basket draft replies (Epic generative AI)**                      | Many Epic customers piloted MyChart message draft replies in 2023–2024. UCSF participation status unverified this pass.                                                                                                                                          | LOW        |                                                                        |
| **UCSF Versa / institutional LLM**                                    | UCSF launched **Versa**, an internal HIPAA-compliant generative AI environment, around 2023–2024 — explicitly the sanctioned tool for staff to use AI on UCSF data. Important context: UCSF's stance is "use Versa for AI on UCSF data, not unsanctioned tools." | MEDIUM     | UCSF IT has a public Versa landing page; URL not fetched this session. |
| **Academic publications on UCSF + AI scribe outcomes**                | UCSF informaticists (e.g., the UCSF Center for Clinical Informatics & Improvement Research) have published on ambient AI evaluation.                                                                                                                             | LOW        |                                                                        |

---

## 7. Open questions for live-APeX verification

These are the items the user must confirm in a live APeX session (or in a
re-run of this research with web access enabled). Each is high-priority for
correctness of an AI assistant tailored to UCSF attendings.

### 7a. Naming & UI (verify by inspecting the live screen)

- [ ] Confirm Storyboard is labeled "Storyboard" in the current APeX build (not renamed).
- [ ] Confirm In Basket is labeled "In Basket" (and folder names: e.g., "Cosign – Notes", "Results", "Patient Calls", "Staff Messages").
- [ ] List the exact note-type labels in the Notes activity dropdown for: Internal Medicine attending inpatient, IM attending outpatient (clinic), surgical attending, ICU attending. (These are the 4 cohorts most likely to differ.)
- [ ] Confirm the exact label of UCSF's primary Patient Summary report(s) per service line (e.g., is there an "MS3 Summary", "Hospital Course Report", "Sign-Out Report"?).
- [ ] Capture the left-rail Storyboard sections in order (allergies, code status, isolation, advance directives, problem list, care team, etc.) — order/inclusion is org-configured.
- [ ] Identify any UCSF-custom activity tabs an attending sees that are not in stock Epic.

### 7b. SmartPhrases (verify the actual library)

- [ ] Pull the UCSF System SmartPhrase list (search SmartPhrase Manager for `UCSF*`, `UC*`, and common service prefixes: `MED`, `IM`, `SURG`, `ICU`, `PEDS`, `ONC`, `CARDS`).
- [ ] Capture the official UCSF attending attestation phrase(s) — exact name and body text.
- [ ] Capture the UCSF discharge-summary template phrases.
- [ ] Capture the UCSF H&P template phrases.
- [ ] Capture the UCSF consult-note template phrases.
- [ ] Identify any required-by-policy SmartPhrases (e.g., for quality metrics, opioid use, HCC capture).

### 7c. BPAs (verify which fire during note-writing)

- [ ] List BPAs that fire during note opening / signing for an attending. Common candidates: VTE prophylaxis, sepsis, Foley/CLABSI, opioid prescribing, problem list reconciliation, advance care planning, code-status confirmation, HCC suggestions.
- [ ] For each: capture trigger text, dismiss options, and whether it blocks signing.

### 7d. Policies (find the actual URLs on UCSF intranet)

- [ ] UCSF Health policy on note copy-forward — exact policy number and URL.
- [ ] UCSF GME policy on note cosign timeframes (residents/fellows/APPs).
- [ ] UCSF Health policy on use of AI/LLM tools with PHI (likely under the Information Security or Compliance policy library).
- [ ] UCSF data classification standard — confirm clinical notes are P4 and what that prohibits.
- [ ] UCSF Health policy on use of browser extensions / third-party software on clinical workstations.
- [ ] CMS Teaching Physician rule attestation — exact phrasing UCSF requires (vs. Joint Commission / CMS minimums).

### 7e. AI tool deployments (verify current state in 2026)

- [ ] Confirm Abridge is the production ambient AI scribe at UCSF Health (vs. Nuance DAX, vs. nothing) as of 2026.
- [ ] If Abridge: which specialties/clinics/inpatient services are live, and which are still pilot/excluded?
- [ ] Has UCSF activated Epic's native generative-AI note-writing assists (NoteWriter AI, In Basket draft replies)? If so, when, and for whom?
- [ ] Is UCSF Versa (institutional LLM) approved for clinical-text use, or only for non-PHI use?
- [ ] What is the stated UCSF Health policy on third-party AI assistants (browser/desktop overlays) accessing APeX content?

### 7f. UCSF Health vs. UCSF (university) distinction

- [ ] Confirm: APeX is UCSF Health (the hospital and clinics). UCSF (the school) does not have its own EHR — clinical training environments use the same APeX.
- [ ] Confirm: Affiliates (ZSFG / SF General, SF VA, BCH Oakland post-merger) — do they share the APeX instance, or are they on separate Epic builds with Care Everywhere only? This matters for cross-site chart review.

### 7g. Versions & rollouts (capture deployment cadence)

- [ ] Confirm current Epic version UCSF is on (Epic upgrades on a rolling cadence; mid-2026 most academic centers are on Epic Aug 2024 / Feb 2025 / Aug 2025 releases).
- [ ] Confirm whether UCSF has migrated from Hyperspace to **Hyperdrive** (the web-based client) — Epic deprecated Hyperspace; most academics finished migration by 2025.

---

## Sources

> **No external sources were fetched this session — all WebSearch / WebFetch /
> Exa / curl operations were blocked by sandbox policy.** The list below is
> the **target URL list** the user (or a re-run) should hit on the next pass.

### UCSF official starting points

- `https://it.ucsf.edu/services/apex` — UCSF IT's APeX service landing page (entry point for tip sheets and links).
- `https://tipsheets.ucsf.edu/` — UCSF's APeX tip-sheet repository (the highest-yield source for UI naming and dotphrases).
- `https://hospitalhandbook.ucsf.edu/` — UCSF Hospital Handbook (resident/attending operational reference; often references APeX workflows).
- `https://meded.ucsf.edu/` — UCSF Medical Education portal (orientation and Epic training material).
- `https://gme.ucsf.edu/` — UCSF GME (cosign and note policies).
- `https://policies.ucsf.edu/` (or the UCSF Health policy library on the intranet) — official policy URLs.
- `https://compliance.ucsf.edu/` — UCSF Compliance, including HIM/coding guidance.
- `https://it.ucsf.edu/policies` — IT policies including data classification.
- `https://versa.ucsf.edu/` (or UCSF IT's Versa landing page) — institutional LLM guidance.

### UCSF news / public-facing AI rollout context

- `https://www.ucsf.edu/news` — UCSF newsroom (search "Abridge", "ambient AI", "Versa").
- `https://www.ucsfhealth.org/` — UCSF Health public site (occasionally publishes patient-facing AI scribe disclosures).

### Vendor + secondary sources

- `https://www.abridge.com/` — Abridge customer page (UCSF Health may be a named customer).
- `https://www.epic.com/` — Epic feature documentation (for cross-checking generic Epic UI).
- HIMSS / Becker's Hospital Review / STAT News articles on UCSF's AI scribe deployment (2024–2025).

### Search strategies for next pass (suggested queries)

- `site:ucsf.edu APeX tip sheet attending`
- `site:tipsheets.ucsf.edu attestation`
- `site:tipsheets.ucsf.edu notewriter`
- `site:tipsheets.ucsf.edu smartphrase`
- `site:it.ucsf.edu APeX storyboard`
- `site:ucsf.edu Abridge ambient`
- `site:ucsf.edu Versa generative AI`
- `UCSF Health policy copy forward note`
- `UCSF GME cosign policy resident note`
- `UCSF data classification P4 clinical notes`
- `UCSF Hyperdrive APeX migration 2025`

---

## Recommended next step for the user

Re-run this research task in a session where WebSearch / WebFetch / Exa / curl
are permitted, OR have the user paste the contents of the UCSF tip-sheets they
have access to (many of UCSF's APeX tip sheets are on the **internal** wiki
behind UCSF SSO and would not be reachable by a public web fetcher anyway —
those will need to be exported by the user directly). The most leverage-per-effort
items for the AI assistant's correctness are, in order:

1. **The UCSF System SmartPhrase library** (especially attestation, H&P, A&P, DC summary, consult).
2. **The exact label of every Storyboard section and Notes-activity note type** for the user's primary specialty.
3. **The list of BPAs that fire during note signing** for the user's specialty.
4. **UCSF Health's current policy on third-party AI tools touching PHI** (this gates the entire product).
