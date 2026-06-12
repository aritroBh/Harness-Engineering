import { clipboard } from "electron";
import {
  addSource,
  createSourceNote,
  type CreateSourceInput,
} from "./contextBundle";
import { clinicalLog, clinicalWarn } from "./logger";
import type { ClinicalContextBundle } from "./types";

export interface CaptureMeta {
  noteType?: string;
  author?: string;
  service?: string;
  timestamp?: string;
  sourceScreen?: string;
  idHint?: string;
}

export interface CaptureResult {
  added: boolean;
  deduped: boolean;
  bundleSize: number;
  sourceId?: string;
}

function buildInput(rawText: string, meta: CaptureMeta): CreateSourceInput {
  return {
    rawText,
    noteType: meta.noteType,
    author: meta.author,
    service: meta.service,
    timestamp: meta.timestamp,
    sourceScreen: meta.sourceScreen,
    idHint: meta.idHint,
  };
}

export function captureFromClipboard(
  bundle: ClinicalContextBundle,
  meta: CaptureMeta,
): CaptureResult {
  const text = clipboard.readText();
  if (!text || !text.trim()) {
    clinicalWarn("captureFromClipboard: clipboard empty");
    return { added: false, deduped: false, bundleSize: bundle.sources.length };
  }
  const source = createSourceNote(buildInput(text, meta));
  const { deduped } = addSource(bundle, source);
  bundle.captureMethod =
    bundle.captureMethod === "mixed" ? "mixed" : "clipboard";
  clinicalLog("captureFromClipboard", {
    sourceId: source.id,
    deduped,
    bundleSize: bundle.sources.length,
    chars: text.length,
  });
  return {
    added: !deduped,
    deduped,
    bundleSize: bundle.sources.length,
    sourceId: source.id,
  };
}

export function captureManualPaste(
  bundle: ClinicalContextBundle,
  rawText: string,
  meta: CaptureMeta,
): CaptureResult {
  if (!rawText || !rawText.trim()) {
    clinicalWarn("captureManualPaste: empty input");
    return { added: false, deduped: false, bundleSize: bundle.sources.length };
  }
  const source = createSourceNote(buildInput(rawText, meta));
  const { deduped } = addSource(bundle, source);
  bundle.captureMethod = "manual_paste";
  clinicalLog("captureManualPaste", {
    sourceId: source.id,
    deduped,
    bundleSize: bundle.sources.length,
    chars: rawText.length,
  });
  return {
    added: !deduped,
    deduped,
    bundleSize: bundle.sources.length,
    sourceId: source.id,
  };
}

export interface VisionExtractor {
  (imageBase64: string): Promise<string>;
}

export async function captureFromVision(
  bundle: ClinicalContextBundle,
  imageBase64: string,
  meta: CaptureMeta,
  extractor: VisionExtractor,
): Promise<CaptureResult> {
  const text = await extractor(imageBase64);
  if (!text || !text.trim()) {
    clinicalWarn("captureFromVision: extractor returned empty text");
    return { added: false, deduped: false, bundleSize: bundle.sources.length };
  }
  const source = createSourceNote(buildInput(text, meta));
  const { deduped } = addSource(bundle, source);
  bundle.captureMethod = "ocr";
  clinicalLog("captureFromVision", {
    sourceId: source.id,
    deduped,
    bundleSize: bundle.sources.length,
    chars: text.length,
  });
  return {
    added: !deduped,
    deduped,
    bundleSize: bundle.sources.length,
    sourceId: source.id,
  };
}
