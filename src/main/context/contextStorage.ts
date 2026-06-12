import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { safeWarn } from "../logger";
import type { ContextSnapshot } from "./contextTracker";

interface StoredContextFile {
  snapshots: ContextSnapshot[];
  updatedAt: number;
}

function storagePath(): string {
  return join(app.getPath("userData"), "context-history.json");
}

export function loadPersistedContextHistory(): ContextSnapshot[] {
  try {
    const file = storagePath();
    if (!existsSync(file)) return [];
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as StoredContextFile;
    return Array.isArray(parsed.snapshots) ? parsed.snapshots.slice(-200) : [];
  } catch (error) {
    safeWarn("[CONTEXT] failed to load persisted history", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function persistContextSnapshot(snapshot: ContextSnapshot): void {
  try {
    const file = storagePath();
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const existing = loadPersistedContextHistory();
    const next: StoredContextFile = {
      snapshots: [...existing, snapshot].slice(-200),
      updatedAt: Date.now(),
    };
    writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
  } catch (error) {
    safeWarn("[CONTEXT] failed to persist snapshot", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
