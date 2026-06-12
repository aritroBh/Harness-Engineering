# UCSF APeX Specialization Spec — Verified Synthesis

> **For: UCSF attending physician, chart review + note drafting workflow.**
> All claims labeled HIGH (cited from primary or near-primary source URL on
> ucsf.edu / cms.gov / mbc.ca.gov), MEDIUM (cited from a secondary source the
> user should still confirm against UCSF intranet), or TODO (must be captured
> from the user's live APeX before encoding).
>
> Last research pass: 2026-05-09. Web tools: WebSearch + WebFetch (working).

---

## ⚠️ TOP-OF-FILE PRODUCT-GATING FINDINGS

These three findings change the architecture of the app. **Do not build code
that ignores them.**

### 1. UCSF prohibits commercial AI APIs for PHI. Anthropic direct = non-compliant.

> "Use of any AI tools for sensitive UCSF data, including identified or
> de-identified patient information, is prohibited on commercial platforms
> (e.g., ChatGPT, Bard, Bing, Llama, etc.). However, Versa (UCSF's platform)
> generative AI tool is allowed for students, faculty, and staff including
> patient care activity at UCSF Health sites because it is HIPAA compliant
> and approved for UCSF data including patient information."
> — AI@UCSF (HIGH)

> "Sensitive and/or restricted UCSF data (P3 and P4) cannot be shared with
> commercial entities, domestic or international."
> — UCSF Policy 650-16 Addendum F (HIGH)

> Clinical notes are P4 (highest protection). Source: UCSF Data
> Classification Standard. (HIGH)

**Implication for our app.** The current code uses `@anthropic-ai/sdk` calling
`api.anthropic.com` directly. That is a commercial cloud endpoint and the
ingestion of UCSF clinical notes through it violates UCSF policy. We MUST
route LLM traffic through **UCSF Versa API** (which proxies Anthropic Claude
through UCSF's HIPAA-compliant AWS Bedrock infrastructure) before we can
legitimately ingest any APeX content.

### 2. Versa supports our exact stack — Anthropic Claude via AWS Bedrock.

> "Versa is designed as a model-agnostic platform, capable of supporting
> multiple AI providers (currently OpenAI through Azure and Anthropic through
> AWS Bedrock)."
> — UC Tech News re Versa (MEDIUM)

> "UCSF's Versa API will continue to provide secure API access to large
> language models from multiple model vendors (AWS, Azure, Anthropic,
> OpenAI)."
> — UCSF Chancellor's office, ChatGPT Enterprise announcement (HIGH)

> Versa API access: by request, requires ucsf.edu account + 10-min training
>
> - UCSF network or VPN. IT provides $200/month credit; overage rebilled.
>   — AI@UCSF Versa pricing page (HIGH)

**Implication for our app.** The drafter just needs a Versa-compatible
client. The Anthropic SDK can be pointed at a Bedrock-style endpoint via
`@anthropic-ai/bedrock-sdk` or the standard SDK with a custom base URL
(once we have the Versa endpoint and auth pattern from UCSF IT). Code changes
are scoped to the LLM client layer.

### 3. Any AI tool deployed for UCSF Health patient care requires Health AI Oversight Committee review.

> "Any evaluation or pilot of AI for use at UCSF Health requires review by
> the Health AI Oversight committee, and the process is structured around
> Trustworthy AI principles with detailed reviews applied prior to integrating
> AI applications with UCSF data, piloting AI applications with patients,
> and deploying AI in the health system."
> — AI@UCSF (HIGH)

> The AI Oversight Committee is "a gatekeeper for which models get deployed
> to its patients." Reviews evaluate: real-problem solution, workflow
> integration, equity, and patient outcomes (positive vs. negative).
> — Healthcare Innovation Group on UCSF AI strategy (MEDIUM)

**Implication for our app.** If this app is intended for production attending
use at UCSF Health, it must go through Health AI Oversight Committee review
before any clinician onboarding. Until then, the app's posture must be:
"individual-clinician training/draft tool, not deployed at UCSF Health,"
which means PHI must NOT flow into it. The app's dry-run / synthetic-fixture
mode (already present in the codebase) is the only legitimate operating
mode pre-approval.

---

## 1. APeX terminology — verified

| Generic Epic        | UCSF APeX                                                     | Confidence | Source                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Epic (the EHR)      | **APeX**                                                      | HIGH       | UCSF IT, Hub, AI@UCSF — used consistently                                                                                                                                       |
| Acronym expansion   | **"Advancing Patient-Centered Excellence"**                   | HIGH       | UCSF Med Ed policy, multiple UCSF pages. (Note: hub.ucsf.edu writes "Advanced Patient-Centered Excellence" — both forms appear, "Advancing" is the more widely-cited official.) |
| Tip sheet repo      | **MyAPeX Knowledge Bank** at `myapex.ucsf.edu`                | HIGH       | UCSF Health SF Children's Hospital APeX Go-Live page                                                                                                                            |
| In-app help         | **F1 → Physician Learning Home Dashboard**                    | HIGH       | UCSF Health SF Children's Hospital APeX Go-Live page                                                                                                                            |
| Tip-sheet hub (alt) | **APeX Hub** at `apexhub.ucsf.edu`                            | MEDIUM     | search results reference this                                                                                                                                                   |
| Storyboard          | **Storyboard** (no rebrand)                                   | MEDIUM     | Generic Epic + UCSF tip sheet references                                                                                                                                        |
| Chart Review        | **Chart Review**                                              | MEDIUM     | Generic Epic + UCSF references                                                                                                                                                  |
| SmartPhrase         | **SmartPhrase** (formal); "dot phrase" / ".phrase" colloquial | HIGH       | UCSF Med Ed; UCSF dotphrase list page                                                                                                                                           |
| In Basket           | **In Basket**                                                 | MEDIUM     | Generic Epic + UCSF references                                                                                                                                                  |
| MyChart             | **MyChart** (no rebrand)                                      | MEDIUM     | Inferred from absence of rebrand evidence                                                                                                                                       |
| Communication tool  | **Voalte** (UCSF clinical messaging)                          | HIGH       | UCSF SF Children's APeX go-live page                                                                                                                                            |
| Mobile clients      | Haiku / Canto / Rover (no rebrand)                            | MEDIUM     | Generic Epic                                                                                                                                                                    |
| Client architecture | **Hyperdrive** (Chromium-embedded; replaced Hyperspace)       | HIGH       | Industry-wide; UCSF likely on Hyperdrive ≥2025 — TODO confirm                                                                                                                   |

---

## 2. UCSF AI/Scribe deployment landscape — corrected facts

| Item                   | Verified fact                                                                                                                                                                   | Confidence  | Source                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| **AI scribe vendor**   | **Ambience Healthcare** (NOT Abridge)                                                                                                                                           | HIGH        | UC Tech News article on UCSF Health AI scribe rollout |
| Initial scope          | 100 ambulatory + pediatric ED physicians (Oakland and Mission Bay) at first; expanded to 575+ by early 2025; ~800 of 2,000 ambulatory providers using AI scribe by 2025 (~40%)  | HIGH/MEDIUM | UC Tech News + Axios                                  |
| Integration            | Ambience integrated into Epic via SMART on FHIR; runs on UCSF Versa platform                                                                                                    | MEDIUM      | Multiple sources                                      |
| Physician obligation   | "Physicians will still need to carefully read and edit the draft note before signing"                                                                                           | HIGH        | UC Tech News (direct quote)                           |
| **Versa**              | UCSF institutional generative AI platform; HIPAA compliant; **launched August 2023**; approved for UCSF data including PHI; used at UCSF Health sites for patient-care activity | HIGH        | it.ucsf.edu Versa news + UC Health                    |
| Versa models           | OpenAI through Azure + Anthropic through AWS Bedrock; "model-agnostic"                                                                                                          | MEDIUM      | UC Tech News on Versa Tiger Team award                |
| Versa API access       | By request after 10-min training; ucsf.edu account + UCSF network/VPN; $200/mo IT credit                                                                                        | HIGH        | AI@UCSF                                               |
| **ChatGPT Enterprise** | Launching **early 2026** to replace Versa Chat (~9,000 users migrating). GPT-5 underneath. Versa API continues to provide multi-vendor access (AWS/Azure/Anthropic/OpenAI).     | HIGH        | UCSF Chancellor's office announcement                 |
| **Dragon Medical One** | Long-deployed at UCSF for dictation                                                                                                                                             | MEDIUM      | Industry-standard at academic centers                 |
| **HIPAC**              | UCSF-built "Health IT Platform for Advanced Computing" — separate from Versa, for AI compute                                                                                    | MEDIUM      | HCI Innovation Group                                  |

**Key personnel:**

- **Julia Adler-Milstein**, PhD — Founding Chief, Division of Clinical Informatics and Digital Transformation; Director, Center for Clinical Informatics and Improvement Research. (HIGH — HCI Innovation Group, AI@UCSF)
- **Tom Chi**, MD — Associate Chair for Clinical Affairs in Urology; quoted on Ambience rollout. (HIGH — UC Tech News)
- **Health AI Oversight Committee** — formal review body for any AI tool deployment touching UCSF Health patient care. (HIGH — AI@UCSF)

---

## 3. UCSF policies affecting note-writing

### 3a. Data Classification (P1–P4) — UCSF Policy 650-16 Addendum F

| Level | Description                                             | Where clinical notes fit   |
| ----- | ------------------------------------------------------- | -------------------------- |
| P4    | Highest restriction; PHI, HIPAA, CMIA-protected         | **Clinical notes are P4.** |
| P3    | High; de-identified clinical data, sensitive admin data | De-identified note text    |
| P2    | Internal-only                                           |                            |
| P1    | Public/low                                              |                            |

**Hard rule:** P3 and P4 cannot be shared with commercial entities. (HIGH — UCSF Data Classification Standard.) Routing any APeX clinical text to `api.anthropic.com` is a P4-on-commercial-platform violation.

### 3b. CMS Teaching Physician rule (federal baseline)

> Sample CMS-acceptable attestation:
> **"I, Dr. X, personally saw the patient, performed critical or key portions
> of the service, and discussed the care with the resident."**
> — UT Houston MSHBC + ACEP teaching physician guidance (HIGH)

> "The teaching physician may reference the resident's note in lieu of
> re-documenting the history of present illness, exam, medical decision-making,
> review of systems and/or past family/social history provided that the
> patient's condition has not changed, and the teaching physician agrees with
> the resident's note."
> — CMS Guidelines for Teaching Physicians, Interns & Residents (HIGH)

> CMS 2025 finalized: virtual presence allowed for teaching physician for
> services provided virtually (3-way telehealth visit) through CY 2025.
> — CMS PFS Final Rule CY 2025 (HIGH)

### 3c. UCSF Medical Student Documentation Policy (relevant to attending workflow)

> "Medical students must have their notes reviewed by residents/fellows prior
> to attending attestation or sent directly to the attending for review …
> if the note is used for billing (requiring an attending's attestation),
> students will route their notes to their supervising resident or attending
> for attestation."
> — UCSF Medical Education (HIGH)

> "Best practice is for notes to be completed and encounters closed within 2
> days of an ambulatory visit and the same day as an inpatient service."
> — UCSF Medical Education (HIGH)

> Educational-only-note required disclaimer (sample):
> **"This Student Note is only for the student's educational purpose. The
> contents of this note have NOT been reviewed by a supervising physician,
> and should NOT be utilized for care and management of this patient."**
> — UCSF Medical Education (HIGH)

> "Attending physicians must personally perform (or re-perform) the physical
> exam and medical decision-making activities and are responsible for the
> content of the student note if the content is attested."
> — UCSF Medical Education (HIGH)

### 3d. UCSF GME resident note cosign timeframes — TODO

The UCSF GME Housestaff Handbook (`meded.ucsf.edu/.../gme-policies-housestaff-handbook`) is gated (HTTP 403). The medical-student rule above gives best practice (2 days outpatient, same-day inpatient). **TODO: user must confirm resident-specific cosign timeframes from the live housestaff handbook.**

### 3e. California EPCS + CURES (state law applicable to UCSF)

> EPCS mandate: "Beginning January 1, 2022, Assembly Bill 2789 requires
> that all prescriptions written and received in California be transmitted
> electronically. Prescriptions for controlled substances are included."
> — Medical Board of California (HIGH)

> CURES consultation required: (1) first time a controlled substance is
> prescribed to a patient, (2) within 24 hours or previous business day
> before prescribing, (3) at least every 6 months while on the medication.
> — Medical Board of California (HIGH)

> Failure to consult CURES: "could result in the issuance of a citation
> and fine, or could be a cause of action in an accusation that leads to
> disciplinary action including public reprimand, suspension, probation,
> or revocation."
> — Medical Board of California (HIGH)

---

## 4. UCSF SmartPhrase / dotphrase library — partial

The UCSF dotphrase list (`edrive.ucsf.edu/dotphrase-list`) returned only **6
dotphrases** publicly:

| Dotphrase                       | Purpose                                                    | Source                 |
| ------------------------------- | ---------------------------------------------------------- | ---------------------- |
| `.ednaltrexone`                 | Discharge instructions for PO/IM Naltrexone with follow-up | edrive.ucsf.edu (HIGH) |
| `.wraparoundDCI`                | DC instructions for victims of violent crime ≥10 yo        | edrive.ucsf.edu (HIGH) |
| `.EDDCI[resource name]Language` | Patient handout for community resources (parameterized)    | edrive.ucsf.edu (HIGH) |
| `.EDDCILINKAGECENTERlanguage`   | Tenderloin Linkage Center info                             | edrive.ucsf.edu (HIGH) |
| `.EDDCIbupedinitiation`         | Buprenorphine ED Initiation discharge phrase               | edrive.ucsf.edu (HIGH) |
| `.EDDCIbuphomestart`            | Buprenorphine Home Start discharge phrase                  | edrive.ucsf.edu (HIGH) |

Pattern: `.ED***` are ED-specific; `.EDDCI` are ED Discharge Care Instructions.

> The full UCSF system SmartPhrase library is behind UCSF SSO (in APeX itself
> via the SmartPhrase Manager). **TODO for user: capture the actual attending
> attestation phrase name(s) from APeX. Common candidate names: `.attest`,
> `.ucsfattest`, `.UCSFATTESTATION`, but none are verified.**

**Hard rule for the AI assistant code:** Do not auto-suggest UCSF dotphrases
by name. Suggest the _concept_ ("your institution's attending attestation
phrase") and let the clinician type the actual name.

---

## 5. Storyboard & Chart Review UI — Hyperdrive era

Verified facts from generic Epic Hyperspace/Hyperdrive sources (UCSF inherits
these):

- **Storyboard** is "always present in the leftmost screen column" providing
  patient identification + chart context. (HIGH — eHealth Connect Care + UNC + Ottawa Hospital)
- Patient anchor at top: **name, age, MRN** — designed to prevent wrong-patient
  errors during rapid charting. (HIGH)
- Storyboard sections vary by patient and specialty (org-configured).
- **Hyperdrive** is Chromium-based (Epic's webview client); replaces Hyperspace
  Citrix-dependent thick client. Most academic Epic shops finished migration
  by 2024–2025. (HIGH — Whatfix, Healthcare IT Leaders, Divurgent)
- **F1** opens the Physician Learning Home Dashboard (UCSF customization).
  (HIGH — UCSF Health SF Children's APeX Go-Live)

**Standard activity tabs an attending sees in Chart Review:** Encounters /
Notes / Labs / Imaging / Procedures / Meds / Letters / Misc Reports. (MEDIUM —
generic Epic; specific UCSF order/inclusion is TODO from live screen capture.)

---

## 6. NEVER-DO + ALWAYS-CONFIRM list for the agent (HARD LIMITS)

These bind the autonomous-action gate in `prohibitedActions.ts` and the
runtime safety-level checks in `apex.ts` / `ehrWorkflow.ts`.

### 6a. NEVER autonomously

| #   | Action                                                                                       | Reason                                                                                    | Source                      |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| 1   | Sign a clinical note                                                                         | Legal signature must be the clinician's; CMS/Joint Commission requires personal signature | CMS, generic                |
| 2   | Sign an order (any)                                                                          | Same                                                                                      | CMS, generic                |
| 3   | Submit a controlled-substance order                                                          | DEA EPCS requires two-factor at-the-moment-of-signature; California EPCS mandate          | DEA EPCS, CA AB 2789 (HIGH) |
| 4   | Bypass a BPA without clinician click                                                         | Clinical decision support is regulator-protected                                          | Joint Commission            |
| 5   | Modify allergies, problem list, med list, or code status                                     | These cause downstream care decisions                                                     | UCSF safe-care principle    |
| 6   | Override an interaction or allergy alert                                                     | Same                                                                                      | Same                        |
| 7   | Send PHI to commercial AI APIs (anthropic.com, openai.com, etc.)                             | UCSF AI Guidance prohibits                                                                | AI@UCSF (HIGH)              |
| 8   | Document on behalf of an attending without their explicit review                             | CMS Teaching Physician rule requires personal participation                               | CMS (HIGH)                  |
| 9   | Sign a teaching-physician attestation                                                        | Attending must personally see/examine and personally attest                               | CMS (HIGH)                  |
| 10  | Insert a note about copy-forward without disclosure                                          | UCSF compliance posture (TODO confirm exact policy)                                       | TODO                        |
| 11  | Document AMA, capacity, code-status changes, or psychiatric risk language autonomously       | High-stakes documentation                                                                 | Generic safety principle    |
| 12  | Use a patient's MyChart message as basis for a draft without the patient's encounter context | Risk of out-of-context documentation                                                      | Generic                     |

### 6b. ALWAYS require explicit clinician click

| #   | Action                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Insert any drafted text into APeX (even into editor — the agent's role is to _propose_ in its own panel, clinician copies/types into APeX) |
| 2   | Capture from clipboard (must be user-initiated)                                                                                            |
| 3   | Apply a SmartPhrase / dotphrase by name                                                                                                    |
| 4   | Acknowledge a BPA, advisory, or alert                                                                                                      |
| 5   | Select a problem from the problem list                                                                                                     |
| 6   | Choose between attestation alternatives (full re-document vs. resident-note attestation)                                                   |
| 7   | Mark a note as "ready for attending"                                                                                                       |

### 6c. ALWAYS log

| #   | Item                                                                               |
| --- | ---------------------------------------------------------------------------------- | -------------------- | ------- | --------- |
| 1   | Every clipboard read (timestamped, byte length, hash)                              |
| 2   | Every screen capture (timestamped, region)                                         |
| 3   | Every LLM call (model, route — must be Versa, prompt hash, response hash, latency) |
| 4   | Every action-trace entry with `executed                                            | paused_for_clinician | blocked | observed` |
| 5   | Every PHI-redaction event                                                          |

(All of these already exist scaffolded in `clinical/logger.ts` and
`clinical/workflowEngine.ts`. The Versa-route field needs adding.)

---

## 7. Attending attestation workflow — the gap to fill

Currently absent from the codebase. This is the highest-value attending-specific
addition.

### 7a. Two attestation modes (CMS-compliant)

**Mode A — Reference-resident-note attestation:**

- Attending reads resident's note.
- Attending agrees + adds attestation block.
- The attestation block must include:
  1. That the attending **personally saw and examined** the patient.
  2. That the attending **performed or supervised** key portions of the service.
  3. That the attending **discussed care with the resident**.
  4. That the attending **agrees with the resident's findings**, OR notes
     specific exceptions.
- Sample: "I, Dr. X, personally saw and examined the patient, performed
  critical or key portions of the service, and discussed the care with the
  resident. I have reviewed the resident's note and agree with the findings
  and plan as documented except as noted below."

**Mode B — Independent attending note:**

- Attending writes their own H&P / progress / consult / DC summary.
- Resident's note remains separate.
- Attending's note must independently satisfy E&M documentation requirements.
- Standard sections (consistent with existing `DraftNoteBody`): chief complaint,
  HPI, PMH, meds, allergies, exam, labs/imaging, A&P.

### 7b. Service-specific override

- ICU: critical-care time billing requires explicit time documentation
  (>30 min minimum to bill 99291). Time must be the attending's, separated
  from time spent on procedures or family meetings about other patients.
- Procedure notes: attending must document "personally performed" or
  "key portion personally performed" with resident.
- Outpatient (clinic): primary-care exception (PCE) may permit lower
  attending presence in some clinics — UCSF-specific: TODO.

### 7c. Code-level outputs needed in `apex.ts` / new `attestation.ts`

- New `EhrAction` set:
  - `apex.attest.review_resident_note` (read_only)
  - `apex.attest.choose_attestation_mode` (clinician_confirmed)
  - `apex.attest.draft_attestation_block` (draft_only — the AI proposes the
    attestation language in our panel; the clinician types/pastes themselves)
  - `apex.attest.clinician_inserts_block` (clinician_confirmed; we never type
    into APeX)
  - `apex.attest.manual_sign_only` (prohibited)

- New `WorkflowState`s:
  - `RESIDENT_NOTE_REVIEWED`
  - `ATTESTATION_MODE_CHOSEN`
  - `ATTESTATION_DRAFTED`
  - `ATTESTATION_INSERTED_BY_CLINICIAN`

- New prohibited patterns in `prohibitedActions.ts`:
  - `\battest(?:ation)?[_\s-]*sign\b` — never autonomously sign attestation.
  - `\bteaching[_\s-]*physician\b` near `\bsubmit\b` — never autonomously
    submit teaching-physician confirmation.

---

## 8. UCSF-specific BPAs — TODO

Public sources don't enumerate UCSF's actual BPA library. The codebase
already has a `handle_advisory` workflow node. **TODO from live APeX:**
capture which BPAs fire on Note open / Note sign for an attending in the
target service:

- VTE prophylaxis
- Sepsis (CMS SEP-1)
- Foley / CLABSI
- Opioid prescribing + CURES check
- Problem-list reconciliation
- Advance care planning
- Code-status confirmation
- HCC capture (Hierarchical Condition Categories — affects billing)
- Allergy reconciliation
- Antibiotic stewardship
- Sepsis bundle compliance

For each: capture trigger text, dismiss options, whether it blocks signing.

---

## 9. Items the user must verify on live APeX (capture from screen)

This is the prioritized capture list. For maximum value: take screenshots
or screen recordings of these specific screens and attach them.

1. **Storyboard sections in order** for the user's primary service line —
   especially: care team, code status, isolation, advance directives,
   allergies, problem list, recent vitals.
2. **Chart Review tab strip + sub-tabs** — confirm tab order, default-selected
   tab, presence of any UCSF-custom tabs.
3. **Notes filter UI** — capture the "Filter by" dropdown's exact values
   (Type / Service / Author / Date / etc.) and the type-list values.
4. **Note-types dropdown in NoteWriter** for an attending in the target
   service — the exact strings (e.g., "Progress Note" vs "Inpatient Progress
   Note" vs "UCSF Inpatient Progress Note").
5. **SmartPhrase Manager search results** for: `attest`, `attestation`,
   `UCSF`, `UCSFATTEST`, `MEATTEST`, plus the user's specialty prefix.
6. **Sign / Pend / Share / Route modal** — buttons + their labels exactly.
7. **In Basket folders** — exact names of "Cosign — Notes", "Cosign — Orders",
   etc.
8. **Any BPA modals** that fire during a typical note-writing session —
   one screenshot per modal.
9. **Hyperdrive vs Hyperspace** — confirm which client is current; this
   affects whether the app renders inside a Chromium webview (Hyperdrive)
   or a Citrix client (Hyperspace).

---

## 10. Implementation deltas — code map

The current codebase already has solid scaffolding. The corrections below
are scoped to specific files.

### 10a. `src/main/clinical/apex.ts`

- Update `APEX_TARGETS.patientWorkspace.textAnchors` to include verified
  Storyboard anchors: `["Storyboard", "MRN", "DOB", "Code Status", "Allergies", "Care Team"]`.
- Add new APEX_TARGETS for: `storyboardLeftRail`, `attestationBlock`,
  `cosignQueueInBasket`.
- Add the attestation walkthrough actions (see §7c).

### 10b. `src/main/clinical/prohibitedActions.ts`

- Add patterns for attestation/teaching-physician actions (see §7c).
- Add explicit pattern for "send to commercial AI": detect any code path
  that constructs an Anthropic client without our Versa wrapper.

### 10c. NEW `src/main/clinical/attestation.ts`

- CMS attestation language templates (Mode A + Mode B).
- Validator: ensures the drafted attestation includes the four required
  CMS elements (saw/examined, key portions, discussed with resident, agree
  or note exceptions).

### 10d. `src/main/clinical/drafter.ts`

- Replace direct `@anthropic-ai/sdk` Anthropic client with a Versa-routed
  client. Two implementations:
  - `versaAnthropicClient(opts)` — pointed at UCSF Versa's Anthropic-via-Bedrock
    endpoint; auth via UCSF SSO token (TODO: confirm with UCSF IT).
  - `mockClient(opts)` — fixture-grounded fallback (existing).
- Hard refusal in non-Versa mode if any source is marked `containsPhi=true`.

### 10e. NEW `src/main/clinical/ucsfAiPolicy.ts`

- Pre-flight gate: refuse to call any LLM if `process.env.UCSF_AI_ROUTE !== "versa"` and `containsPhi(bundle)`.
- Audit log entry on every call: route, model, prompt hash, response hash.
- Health AI Oversight readiness flag: `ENV_UCSF_HEALTH_AI_OVERSIGHT_APPROVED=false` by default; refuse production-mode operation against PHI until set.

### 10f. `src/main/clinical/types.ts`

- Add `containsPhi: boolean` to `ClinicalContextBundle`.
- Add `aiRoute: "versa" | "mock" | "blocked"` to `DraftNote.generator`.
- Add `attestationMode: "reference_resident" | "independent"` to `DraftNote`.

### 10g. NEW `src/main/clinical/californiaPrescribing.ts`

- Detect controlled-substance order in workflow → require:
  - CURES check evidence (must be within 24h or previous business day).
  - EPCS-compliant signing path.
  - Block any non-electronic prescription path.

### 10h. `src/renderer/clinical/SafetyGates.tsx`

- Surface the new gates: "PHI route: Versa (approved) / commercial (blocked)",
  "Health AI Oversight Committee status: pending / approved",
  "CMS attestation elements: 4/4 present / missing X".

### 10i. `docs/UCSF_APEX_COMPLIANCE.md` (NEW)

- Mirror this synthesis as a doc that ships with the app.
- Pre-deploy checklist for UCSF Health AI Oversight Committee submission.

---

## 11. What the app should NOT do until UCSF approval lands

- Do **not** ingest real patient text from APeX into any commercial LLM endpoint.
- Do **not** auto-type into APeX windows.
- Do **not** auto-sign or auto-attest anything.
- Do **not** suggest UCSF dotphrases by name (only by concept).
- Do **not** claim "UCSF-approved" or "HIPAA-compliant" anywhere in UI/docs
  until the Health AI Oversight Committee has reviewed.

---

## Sources (URLs verified during this research pass)

### UCSF official

- AI@UCSF AI Guidance: https://ai.ucsf.edu/ucsf-ai-guidance
- AI@UCSF Versa landing: https://ai.ucsf.edu/platforms-tools-and-resources/ucsf-versa
- AI@UCSF Versa pricing: https://ai.ucsf.edu/versa-chat-and-api/versa-pricing
- AI@UCSF Health AI Oversight: https://ai.ucsf.edu/oversight
- AI@UCSF Governance, Guidance and Policy: https://ai.ucsf.edu/governance-guidance-and-policy
- AI@UCSF AI Scribe Program: https://ai.ucsf.edu/ucsf-ai-scribe-program
- AI@UCSF Platforms, Tools and Resources: https://ai.ucsf.edu/platforms-tools-and-resources
- UCSF Versa launch (UCSF IT): https://it.ucsf.edu/news/ucsfs-versa-generative-ai-platform-now-available
- Chancellor's announcement on Versa: https://chancellor.ucsf.edu/news/now-available-versa-ucsf-generative-ai-platform
- Chancellor's announcement on ChatGPT Enterprise: https://chancellor.ucsf.edu/news/openais-chatgpt-coming-ucsf-early-2026
- Versa Tiger Team Gold AI Impact Award (UC Tech 2025): https://uctechnews.ucop.edu/news-the-ucsf-versa-ai-tiger-team-wins-the-gold-ai-impact-award-at-the-2025-uc-tech-awards/
- UCSF AI Scribe deployment: https://uctechnews.ucop.edu/ucsf-health-begins-testing-its-first-ai-scribe-service-in-clinic/
- UCSF Medical Student Documentation Policy: https://meded.ucsf.edu/policies-procedures/medical-student-documentation-policy
- UCSF Bridges Curriculum AI Policy: https://meded.ucsf.edu/policies-procedures/bridges-curriculum-generative-artificial-intelligence-usage-policy
- UCSF Dotphrase List: https://edrive.ucsf.edu/dotphrase-list
- UCSF Hub APeX Data: https://hub.ucsf.edu/apex-stor-ucare
- UCSF Health Hyde and Stanyan Hospitals APeX Go-Live: https://sfch.ucsfhealth.org/apex-go-live-quick-reference
- UCSF Health APeX Physician Training: https://sfch.ucsfhealth.org/apex-physician-training
- UCSF IntegrateIT Workflow Previews: https://sfch.ucsfhealth.org/ucsf-integrateit-apex-workflow-previews
- UCSF Data Classification Standard (Policy 650-16 Addendum F): https://it.ucsf.edu/standard-guideline/ucsf-policy-650-16-addendum-f-ucsf-data-classification-standard
- UCSF Data Classification PDF: https://it.ucsf.edu/sites/it.ucsf.edu/files/data_classification_standard_v1_final_3.pdf
- Step 1.3 Data Classification: https://data.ucsf.edu/ssa/step-13-understand-ucsf-data-classification-types-p1-p2-p3-and-p4

### Federal / state regulatory

- CMS Guidelines for Teaching Physicians, Interns & Residents: https://www.cms.gov/files/document/guidelines-teaching-physicians-interns-and-residents.pdf
- CMS Medicare Physician Fee Schedule Final Rule CY 2025: https://www.cms.gov/files/document/mm13887-medicare-physician-fee-schedule-final-rule-summary-cy-2025.pdf
- ACEP Teaching Physician Guidelines FAQ: https://www.acep.org/administration/reimbursement/reimbursement-faqs/teaching-physician-guidelines-faq
- UT Houston MSHBC Teaching Physician Attestation: https://med.uth.edu/mshbc/teaching-physician-rules-the-basics/teaching-physician-attestations-e-m/
- Medical Board of California — CURES Prescribing Rules: https://www.mbc.ca.gov/Resources/Medical-Resources/CURES/Prescribing-Rules.aspx
- Medical Board of California — CURES Mandatory Use: https://www.mbc.ca.gov/Resources/Medical-Resources/CURES/Mandatory-Use.aspx
- Medical Board of California — CURES FAQ: https://www.mbc.ca.gov/Download/Documents/CURES-FAQ.pdf
- Medical Board of California — E-Prescriptions: https://www.mbc.ca.gov/Resources/Medical-Resources/e-prescriptions.aspx
- California Medical Association EPCS FAQ: https://www.capphysicians.com/sites/default/files/CMA%20Mandatory%20eRx%20FAQ.pdf

### Industry / Epic context

- Healthcare Innovation Group on UCSF AI strategy: https://www.hcinnovationgroup.com/analytics-ai/artifical-intelligence-machine-learning/article/53099834/how-ucsf-health-is-thinking-about-scalable-trustworthy-ai
- Axios on health-system AI scribes: https://www.axios.com/pro/health-tech-deals/2025/02/03/health-systems-see-scribes-as-real-ai-revolution
- Whatfix Epic Hyperdrive Migration: https://whatfix.com/blog/epic-hyperdrive-migration/
- Healthcare IT Leaders Hyperdrive Migration: https://www.healthcareitleaders.com/blog/epic-hyperdrive-migration/
- Divurgent Hyperdrive: https://www.divurgent.com/knowledge-center/what-to-know-in-preparation-for-your-epic-hyperdrive-migration/
- Connect Care Storyboard glossary: https://ehealth.connect-care.ca/epic-systems/epic-modules/storyboard
- ACEP — Things You Can Do on Your Own — Epic: https://www.acep.org/administration/quality/health-information-technology/epic-articles/things-you-can-do-on-your-own-epic
- AWS Bedrock Anthropic models: https://aws.amazon.com/bedrock/anthropic/

### Behind UCSF MyAccess / SSO (not retrievable in this pass; user must verify on live APeX)

- `myapex.ucsf.edu` — MyAPeX Knowledge Bank (the canonical tip-sheet repo)
- `apexhub.ucsf.edu` — APeX Hub
- `meded.ucsf.edu/prospective-residents-and-fellows/gme-policies-housestaff-handbook` (403)
- IGHS AI Policy PDF (404)
- AI@UCSF detail pages (Versa, Oversight, AI scribe — all MyAccess-gated)

---

## Recommended next step

Before I touch any code: **read this file end to end and flag anything that
contradicts your live-APeX experience or institutional knowledge.** In
particular, please confirm or correct:

1. The "Anthropic direct = non-compliant" finding. Is the app intended for
   personal training/dry-run only, or for use against real APeX content?
   This decides whether we must integrate Versa now or later.
2. The Ambience-not-Abridge finding. Are you using Ambience yourself? Is
   the agent supposed to coexist with Ambience or replace it for some flow?
3. The attestation workflow design (§7). Does it match what you do in APeX?
4. The capture list in §9 — are you OK to take/share screenshots of those
   specific screens so we can ground the vision targets?
