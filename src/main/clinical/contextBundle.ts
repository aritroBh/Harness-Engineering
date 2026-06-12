import { createHash } from "crypto";
import type {
  ClinicalContextBundle,
  ClinicalSections,
  ClinicalSourceNote,
} from "./types";

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function hashContent(text: string): string {
  return createHash("sha256")
    .update(normalizeWhitespace(text).toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

const SECTION_PATTERNS: Array<[keyof ClinicalSections, RegExp]> = [
  ["chiefComplaint", /\b(chief complaint|cc)\s*:?\s*([^\n]+)/i],
  [
    "hpi",
    /\b(history of present illness|hpi)\s*:?\s*([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&]+:|\n\s*$|$)/i,
  ],
  [
    "pmh",
    /\b(past medical history|pmh)\s*:?\s*([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&]+:|\n\s*$|$)/i,
  ],
  [
    "meds",
    /\b(medications?|home meds)\s*:?\s*([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&]+:|\n\s*$|$)/i,
  ],
  [
    "allergies",
    /\b(allergies)\s*:?\s*([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&]+:|\n\s*$|$)/i,
  ],
  [
    "exam",
    /\b(physical exam(?:ination)?|exam|pe)\s*:?\s*([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&]+:|\n\s*$|$)/i,
  ],
  [
    "labs",
    /\b(labs?|laboratory)\s*:?\s*([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&]+:|\n\s*$|$)/i,
  ],
  [
    "imaging",
    /\b(imaging|radiology|ct|mri|x-?ray)\s*:?\s*([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&]+:|\n\s*$|$)/i,
  ],
  [
    "assessmentPlan",
    /\b(assessment(?:\s*(?:and|&)\s*plan)?|a\s*\/\s*p|plan)\s*:?\s*([\s\S]*?)$/i,
  ],
];

export function extractSections(rawText: string): ClinicalSections {
  const result: ClinicalSections = {};
  const text = normalizeWhitespace(rawText);
  for (const [key, rx] of SECTION_PATTERNS) {
    const match = text.match(rx);
    if (match && match[2]) {
      const value = match[2].trim();
      if (value) result[key] = value;
    }
  }
  return result;
}

export interface CreateSourceInput {
  rawText: string;
  noteType?: string;
  author?: string;
  service?: string;
  timestamp?: string;
  sourceScreen?: string;
  idHint?: string;
}

export function createSourceNote(input: CreateSourceInput): ClinicalSourceNote {
  const raw = normalizeWhitespace(input.rawText);
  const contentHash = hashContent(raw);
  const id = input.idHint
    ? `${input.idHint}_${contentHash.slice(0, 6)}`
    : `note_${contentHash.slice(0, 8)}`;
  return {
    id,
    noteType: input.noteType,
    author: input.author,
    service: input.service,
    timestamp: input.timestamp,
    sourceScreen: input.sourceScreen,
    rawText: raw,
    extractedSections: extractSections(raw),
    contentHash,
  };
}

export function createBundle(
  patientContext?: ClinicalContextBundle["patientContext"],
): ClinicalContextBundle {
  return {
    patientContext,
    sources: [],
    createdAt: new Date().toISOString(),
    captureMethod: "mixed",
  };
}

export function addSource(
  bundle: ClinicalContextBundle,
  source: ClinicalSourceNote,
): { bundle: ClinicalContextBundle; deduped: boolean } {
  const existing = bundle.sources.find(
    (s) => s.contentHash === source.contentHash,
  );
  if (existing) {
    return { bundle, deduped: true };
  }
  bundle.sources.push(source);
  return { bundle, deduped: false };
}

export function summarizeBundle(bundle: ClinicalContextBundle): string {
  const lines = [
    `bundle: ${bundle.sources.length} source(s)`,
    `captureMethod: ${bundle.captureMethod}`,
    ...bundle.sources.map(
      (s) =>
        `  - ${s.id} | ${s.noteType ?? "note"} | ${s.rawText.length} chars | hash=${s.contentHash}`,
    ),
  ];
  return lines.join("\n");
}
