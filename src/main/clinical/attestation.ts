import type {
  AttestationDraft,
  AttestationElements,
  AttestationMode,
  ClinicalSourceNote,
} from "./types";

export const ATTESTATION_REQUIRED_ELEMENTS: Array<keyof AttestationElements> = [
  "saw_examined_personally",
  "performed_or_supervised_key_portions",
  "discussed_care_with_resident",
  "agree_with_resident_or_noted_exceptions",
];

const ELEMENT_PATTERNS: Record<keyof AttestationElements, RegExp[]> = {
  saw_examined_personally: [
    /\bpersonally\s+(?:saw|examined|evaluated|assessed)\b/i,
    /\bI\s+(?:saw|examined|evaluated)\s+the\s+patient\b/i,
    /\bin\s+person\s+(?:saw|examined)\b/i,
  ],
  performed_or_supervised_key_portions: [
    /\bperformed\s+(?:critical|key)\s+portions\b/i,
    /\bkey\s+portion(?:s)?\s+(?:personally|of\s+the\s+service)\b/i,
    /\bsupervised\s+(?:critical|key)\s+portions\b/i,
    /\bpresent\s+for\s+(?:critical|key)\s+portions\b/i,
  ],
  discussed_care_with_resident: [
    /\bdiscussed\s+(?:the\s+)?(?:care|case|management|plan)\s+with\s+the\s+resident\b/i,
    /\bdiscussed\s+with\s+(?:the\s+)?resident\b/i,
    /\bteaching\s+discussion\s+with\s+(?:the\s+)?resident\b/i,
  ],
  agree_with_resident_or_noted_exceptions: [
    /\bagree\s+with\s+(?:the\s+)?(?:resident'?s?\s+)?(?:findings|note|assessment|plan|documentation)\b/i,
    /\bI\s+have\s+reviewed\s+the\s+resident'?s?\s+note\b/i,
    /\bexcept\s+as\s+noted\b/i,
    /\bmy\s+own\s+independent\b/i,
    /\breflects\s+my\s+own\b/i,
    /\bindependent\s+(?:history|examination|medical\s+decision-making|assessment|plan)\b/i,
  ],
};

export function detectAttestationElements(text: string): AttestationElements {
  const result: AttestationElements = {
    saw_examined_personally: false,
    performed_or_supervised_key_portions: false,
    discussed_care_with_resident: false,
    agree_with_resident_or_noted_exceptions: false,
  };
  for (const key of ATTESTATION_REQUIRED_ELEMENTS) {
    result[key] = ELEMENT_PATTERNS[key].some((rx) => rx.test(text));
  }
  return result;
}

export function isAttestationComplete(elements: AttestationElements): boolean {
  return ATTESTATION_REQUIRED_ELEMENTS.every((k) => elements[k] === true);
}

export function missingAttestationElements(
  elements: AttestationElements,
): Array<keyof AttestationElements> {
  return ATTESTATION_REQUIRED_ELEMENTS.filter((k) => elements[k] !== true);
}

export interface AttestationDraftInput {
  mode: AttestationMode;
  residentNote?: ClinicalSourceNote;
  exceptions?: string;
}

export function draftReferenceResidentAttestation(
  input: AttestationDraftInput,
): AttestationDraft {
  const exceptions = (input.exceptions || "").trim();
  const exceptionTail = exceptions
    ? ` I have reviewed the resident's note and agree with the findings and plan as documented except as noted: ${exceptions}.`
    : " I have reviewed the resident's note and agree with the findings and plan as documented except as noted below.";

  const body =
    "I, [ATTENDING NAME], personally saw and examined the patient, performed critical or key portions of the service, and discussed the care with the resident." +
    exceptionTail;

  const elements = detectAttestationElements(body);
  const warnings: string[] = [
    "CMS sample language. Replace [ATTENDING NAME] before signing.",
    "Required by CMS Teaching Physician rule. Attending must have personally seen the patient.",
    "Clinician must verify all four elements are present and accurate before signing.",
  ];
  if (!isAttestationComplete(elements)) {
    warnings.push(
      `Missing CMS-required element(s): ${missingAttestationElements(elements).join(", ")}.`,
    );
  }
  return {
    mode: "reference_resident_note",
    body,
    elements_present: elements,
    exceptions_noted: exceptions,
    resident_note_source_id: input.residentNote?.id,
    warnings,
  };
}

export function draftIndependentAttendingNoteHeader(
  exceptions?: string,
): AttestationDraft {
  const trimmedExceptions = (exceptions || "").trim();
  const exceptionLine = trimmedExceptions
    ? ` Differences from resident documentation: ${trimmedExceptions}.`
    : "";
  const body =
    "I, [ATTENDING NAME], personally saw and examined the patient, performed critical or key portions of the service, and discussed the care with the resident. The note that follows reflects my own independent history, examination, medical decision-making, and plan." +
    exceptionLine;
  const elements = detectAttestationElements(body);
  return {
    mode: "independent_attending_note",
    body,
    elements_present: elements,
    exceptions_noted: trimmedExceptions,
    warnings: [
      "CMS sample language. Replace [ATTENDING NAME] before signing.",
      "Independent attending note must satisfy E&M documentation requirements on its own.",
      "Clinician must verify all four CMS elements are present and accurate before signing.",
    ],
  };
}

export function draftAttestation(
  input: AttestationDraftInput,
): AttestationDraft {
  if (input.mode === "reference_resident_note") {
    return draftReferenceResidentAttestation(input);
  }
  return draftIndependentAttendingNoteHeader(input.exceptions);
}

export interface AttestationValidationResult {
  ok: boolean;
  missing: Array<keyof AttestationElements>;
  warnings: string[];
}

export function validateAttestation(
  draft: AttestationDraft,
): AttestationValidationResult {
  const missing = missingAttestationElements(draft.elements_present);
  const warnings = [...draft.warnings];
  if (/\[ATTENDING NAME\]/i.test(draft.body)) {
    warnings.push(
      "Body still contains placeholder [ATTENDING NAME]; clinician must replace before signing.",
    );
  }
  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

export function looksLikeResidentNote(note: ClinicalSourceNote): boolean {
  const haystack =
    `${note.author || ""} ${note.noteType || ""} ${note.service || ""}`.toLowerCase();
  return /\bresident|fellow|intern|pgy[- ]?\d|house\s*staff\b/.test(haystack);
}
