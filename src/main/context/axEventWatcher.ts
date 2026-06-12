import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import { dumpAxElements } from "../axDump";
import { ensureAxDumpReady } from "../axDump";
import { safeLog, safeWarn, safeError } from "../logger";
import type { SerializedTree } from "../../shared/partA-contract";
import { buildSerializedTree } from "../ai/treeSerializer";

interface AxWatchEvent {
  event: string;
  pid: number;
}

interface AxClickEvent {
  event: "click";
  x: number;
  y: number;
  pid: number;
  button: "left" | "right";
}

class AxEventWatcher extends EventEmitter {
  private proc: ChildProcess | null = null;
  private bundleId: string | null = null;
  private latestTree: SerializedTree | null = null;
  private refreshing = false;

  start(bundleId: string): void {
    if (this.proc) this.stop();
    this.bundleId = bundleId;

    const helper = ensureAxDumpReady();
    if (!helper) {
      safeWarn("[AX_WATCHER] ax-dump not ready; falling back to poll");
      return;
    }

    this.proc = spawn(helper, ["--watch", bundleId], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const rl = createInterface({ input: this.proc.stdout! });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.event === "click") {
          const clickEvt = parsed as AxClickEvent;
          safeLog("[AX_WATCHER] click", {
            x: clickEvt.x,
            y: clickEvt.y,
            button: clickEvt.button,
          });
          this.emit("click", {
            x: clickEvt.x,
            y: clickEvt.y,
            button: clickEvt.button,
            pid: clickEvt.pid,
            t: Date.now(),
          });
          return;
        }
        const evt = parsed as AxWatchEvent;
        safeLog("[AX_WATCHER] event", { event: evt.event });
        this.emit("axEvent", evt);
        // Re-dump the tree on every notification (debounced to one in-flight at a time).
        void this.refreshTree();
      } catch {
        return;
      }
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      safeWarn("[AX_WATCHER] stderr", { msg: chunk.toString().trim() });
    });

    this.proc.on("close", (code) => {
      safeWarn("[AX_WATCHER] watcher exited", { code, bundleId });
      this.proc = null;
      this.emit("closed", { bundleId, code });
    });

    this.proc.on("error", (err) => {
      safeError("[AX_WATCHER] spawn error", { error: err.message });
      this.proc = null;
    });

    safeLog("[AX_WATCHER] started", { bundleId });
  }

  stop(): void {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        /* ignore */
      }
      this.proc = null;
    }
    this.bundleId = null;
    this.latestTree = null;
  }

  isRunning(): boolean {
    return this.proc !== null;
  }

  getLatestTree(): SerializedTree | null {
    return this.latestTree;
  }

  /** Force a one-off tree refresh (e.g. on session start). */
  async forceRefresh(): Promise<SerializedTree | null> {
    return this.refreshTree();
  }

  private async refreshTree(): Promise<SerializedTree | null> {
    if (this.refreshing || !this.bundleId) return this.latestTree;
    this.refreshing = true;
    try {
      const dump = await dumpAxElements(this.bundleId);
      if (!dump) return this.latestTree;

      const tree = buildSerializedTree(dump);
      this.latestTree = tree;
      this.emit("treeChanged", tree);
      return tree;
    } catch (err: any) {
      safeError("[AX_WATCHER] refresh failed", { error: err?.message });
      return this.latestTree;
    } finally {
      this.refreshing = false;
    }
  }
}

export const axEventWatcher = new AxEventWatcher();
