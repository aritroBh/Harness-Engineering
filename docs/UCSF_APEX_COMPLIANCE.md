# UCSF APeX Compliance Posture

This app's clinical mode is specialized for **UCSF Health attending physicians**
using **APeX** (UCSF's Epic deployment, "Advancing Patient-Centered Excellence")
for chart review and note drafting.

This doc describes the compliance posture, the gates, and what must be true
before this app can ingest real patient text from APeX.

---

## TL;DR

- **Anthropic API direct = NOT permitted for PHI.** UCSF policy 650-16 prohibits
  P3/P4 data on commercial AI endpoints.
- **UCSF Versa = the approved gateway** for LLM access (HIPAA-compliant; routes
  to Anthropic Claude via AWS Bedrock).
- **Health AI Oversight Committee review is required** before any UCSF Health
  patient-care deployment.
- The app refuses PHI ingestion on the commercial route by default.

---

## Routes

The drafter selects an LLM route via `UCSF_AI_ROUTE`:

| `UCSF_AI_ROUTE` value | Route                                            | PHI permitted?                                            |
| --------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `ucsf_versa`          | UCSF Versa API → Anthropic Claude on AWS Bedrock | Yes (when bundle is PHI and Health-AI-Oversight-approved) |
| `anthropic_direct`    | api.anthropic.com (commercial)                   | **No** — refused if `bundle.containsPhi === true`         |
| `mock` (default)      | Source-grounded fixture fallback (offline)       | N/A — no LLM call                                         |
| `blocked`             | Refuse all LLM calls                             | N/A                                                       |

`anthropic_direct` additionally requires `UCSF_ALLOW_ANTHROPIC_DIRECT_FOR_SYNTHETIC=true`
and a non-PHI bundle, intended only for development with synthetic fixtures.

## Environment variables

```bash
# Required for PHI workflow
UCSF_AI_ROUTE=ucsf_versa
UCSF_VERSA_BASE_URL=...           # confirm with UCSF IT (ai.ucsf.edu)
UCSF_VERSA_API_KEY=...            # request via AI@UCSF after 10-min training
UCSF_HEALTH_AI_OVERSIGHT_APPROVED=true  # set ONLY after Committee approval

# Synthetic-fixture development (no PHI)
UCSF_AI_ROUTE=anthropic_direct
UCSF_ALLOW_ANTHROPIC_DIRECT_FOR_SYNTHETIC=true
ANTHROPIC_API_KEY=...

# Default — fully offline
UCSF_AI_ROUTE=mock
```

## Bundle metadata

Every `ClinicalContextBundle` should set:

- `containsPhi: boolean` — `true` if any source contains real patient
  identifiers; `false` for synthetic fixtures.
- `institution: "ucsf_health" | "ucsf_other" | "non_ucsf" | "synthetic"` —
  source environment.

The `preflightCheck` in `ucsfAiPolicy.ts` reads these to decide whether to
permit the LLM call. If you forget to set `containsPhi=true` on real data, the
policy gate fails open — **always set the flag explicitly**.

---

## Hard limits (encoded in `prohibitedActions.ts`)

The agent will refuse to autonomously perform any of:

1. Sign a clinical note
2. Sign an order
3. Submit a controlled-substance order
4. Bypass a Best Practice Advisory without clinician confirmation
5. Sign or commit a teaching-physician attestation
6. Auto-type into APeX (the agent never types in APeX; clinician copy/pastes)
7. Send PHI to a commercial LLM endpoint

---

## Attending attestation workflow

The `attestation.ts` module implements CMS Teaching Physician attestation in
two modes:

- **Mode A — `reference_resident_note`**: attending references the resident's
  note and adds an attestation block. Body includes the four CMS-required
  elements:
  1. Personally saw and examined the patient
  2. Performed (or supervised) the critical/key portions
  3. Discussed care with the resident
  4. Agree with the resident's findings, OR notes specific exceptions

- **Mode B — `independent_attending_note`**: attending writes their own
  H&P / progress / consult / DC summary. The note must independently satisfy
  E&M documentation requirements.

Sample CMS-acceptable language (encoded in `draftReferenceResidentAttestation`):

> "I, [ATTENDING NAME], personally saw and examined the patient, performed
> critical or key portions of the service, and discussed the care with the
> resident. I have reviewed the resident's note and agree with the findings
> and plan as documented except as noted [...]"

**The agent never signs.** The clinician must:

1. Read and verify the drafted attestation block in our panel.
2. Copy/paste (or retype) into APeX's NoteWriter themselves.
3. Personally hit Sign in APeX.

`validateAttestation()` returns the missing CMS element keys if any are absent.

---

## Pre-deployment checklist for UCSF Health

Before this app is used by any UCSF Health attending against real APeX content:

1. [ ] Submit to UCSF Health AI Oversight Committee for review
       (`https://ai.ucsf.edu/oversight`).
2. [ ] Request UCSF Versa API access (`https://ai.ucsf.edu/contact/versa-support`).
3. [ ] Complete UCSF AI training (10-min online course required for Versa).
4. [ ] Confirm BAA / data-handling agreement with UCSF IT covers app's
       collection of clipboard / screen capture data.
5. [ ] Run app with `UCSF_AI_ROUTE=ucsf_versa` and `UCSF_HEALTH_AI_OVERSIGHT_APPROVED=true`.
6. [ ] Verify audit log surface in `SafetyGates` shows route, model, prompt
       hash, and clinician identity for every LLM call.
7. [ ] Validate no commercial-AI endpoint is reachable from the app's main
       process when `UCSF_AI_ROUTE=ucsf_versa`.
8. [ ] Run the attestation module's 4-element validator against every drafted
       attestation block; refuse to display a draft missing any element.

Until **all** of these are checked, operate in `mock` mode with synthetic
fixtures only.

---

## Sources of truth

The full research synthesis with citations is at
[`research/00-SYNTHESIS-ucsf-apex-spec.md`](../research/00-SYNTHESIS-ucsf-apex-spec.md).
