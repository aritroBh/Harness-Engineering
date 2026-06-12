import { BrowserWindow, ipcMain } from "electron";
import { existsSync, readFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { join, resolve, basename } from "path";
import { is } from "@electron-toolkit/utils";
import { safeLog, safeError } from "./logger";

let dashboardWindow: BrowserWindow | null = null;

function wikiRoot(): string {
  return resolve(
    process.cwd(),
    process.env.GHOSTWIKI_WIKI_ROOT || "./demo-workflows/event-recap/wiki",
  );
}

function graphsDir(): string {
  return join(homedir(), "Library", "Application Support", "Specter");
}

interface MemoryEntry {
  id: string;
  title: string;
  timestamp: string;
  confidence: number | null;
  tags: string[];
  sourceSessionId: string;
  body: string;
  isCorrection: boolean;
}

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { meta, body: raw.slice(match[0].length) };
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function readMemories(): MemoryEntry[] {
  const root = wikiRoot();
  const entries: MemoryEntry[] = [];
  for (const file of listMarkdownFiles(root)) {
    try {
      const raw = readFileSync(file, "utf-8");
      const { meta, body } = parseFrontmatter(raw);
      const tags = (meta.tags || "")
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      entries.push({
        id: basename(file, ".md"),
        title: meta.title || basename(file, ".md"),
        timestamp: meta.timestamp || "",
        confidence: meta.confidence ? Number(meta.confidence) : null,
        tags,
        sourceSessionId: meta.sourceSessionId || "",
        body: body.trim(),
        isCorrection:
          tags.includes("correction") || /^correction-/.test(basename(file)),
      });
    } catch (error) {
      safeError("[DASHBOARD] failed reading wiki page", { file, error });
    }
  }
  entries.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return entries;
}

function graphSources(): { name: string; path: string; demo: boolean }[] {
  const sources: { name: string; path: string; demo: boolean }[] = [];
  const dir = graphsDir();
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".json")) {
        sources.push({ name, path: join(dir, name), demo: false });
      }
    }
  }
  // Demo workflow graph ships with the repo so the Progress tab has content
  // before the user has recorded their own sessions.
  const demoGraph = resolve(
    process.cwd(),
    "demo-workflows/event-recap/graph.json",
  );
  if (existsSync(demoGraph)) {
    sources.push({ name: "Luma.json", path: demoGraph, demo: true });
  }
  return sources;
}

function readProgress(): any[] {
  const apps: any[] = [];
  for (const { name, path, demo } of graphSources()) {
    try {
      const graph = JSON.parse(readFileSync(path, "utf-8"));
      const nodes = Object.entries(graph.nodes || {}).map(
        ([id, node]: [string, any]) => ({
          id,
          label: node?.label || node?.title || id,
          completed: Boolean(node?.completed),
          attempts: Number(node?.attempts) || 0,
          avgStepTimeMs: Number(node?.avgStepTimeMs) || 0,
        }),
      );
      const sessions = Array.isArray(graph.sessions) ? graph.sessions : [];
      const checkpoints = Object.values(graph.behavioralCheckpoints || {}).map(
        (cp: any) => ({
          id: cp?.id || "",
          timestamp: cp?.timestamp || "",
          mood: cp?.mood || cp?.signature?.summary?.[0] || "",
          flowScore: cp?.signature?.flowScore ?? null,
        }),
      );
      apps.push({
        app: (graph.app || basename(name, ".json")) + (demo ? " (demo)" : ""),
        nodeCount: nodes.length,
        completedCount: nodes.filter((n) => n.completed).length,
        nodes,
        sessionsCount: sessions.length,
        lastSessionAt: sessions.length
          ? sessions[sessions.length - 1]?.timestamp || ""
          : "",
        totalStepsRecorded: sessions.reduce(
          (sum: number, s: any) =>
            sum + (Array.isArray(s?.steps) ? s.steps.length : 0),
          0,
        ),
        behavioralFrameCount: Array.isArray(graph.behavioralFrames)
          ? graph.behavioralFrames.length
          : 0,
        checkpoints,
      });
    } catch (error) {
      safeError("[DASHBOARD] failed reading graph", { name, error });
    }
  }
  return apps;
}

export function registerDashboardIpc(): void {
  ipcMain.handle("dashboard:listMemories", () => {
    return { ok: true, wikiRoot: wikiRoot(), memories: readMemories() };
  });
  ipcMain.handle("dashboard:getProgress", () => {
    return { ok: true, apps: readProgress() };
  });
  ipcMain.handle("dashboard:show", () => {
    showDashboardWindow();
    return { ok: true };
  });
}

export function showDashboardWindow(): void {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    title: "Specter Memory",
    backgroundColor: "#0c0d12",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/dashboard.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  dashboardWindow.on("closed", () => {
    dashboardWindow = null;
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void dashboardWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/dashboard.html`,
    );
  } else {
    void dashboardWindow.loadFile(
      join(__dirname, "../renderer/dashboard.html"),
    );
  }

  safeLog("[DASHBOARD] window opened");
}
