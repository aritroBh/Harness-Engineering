/**
 * Per-app skill profile store (Part A / A5 / M4).
 *
 * Persists what the user knows / struggled with per app, so the planner can
 * skip what they've mastered and the greeting can do the "Welcome back!" moment.
 * Mirrors storage.ts's JSON-under-Application-Support convention. The path is
 * overridable via SPECTER_PROFILE_PATH for tests.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { safeError } from "../logger";
import type { ProfilePayload, SkillProfile } from "../../shared/partA-contract";

const PROFICIENCIES: SkillProfile["proficiency"][] = [
  "beginner",
  "beginner+",
  "intermediate",
  "advanced",
];

function profilesPath(): string {
  if (process.env.SPECTER_PROFILE_PATH) return process.env.SPECTER_PROFILE_PATH;
  return join(
    homedir(),
    "Library",
    "Application Support",
    "Specter",
    "skill-profiles.json",
  );
}

function stringArray(value: any): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((v) => typeof v === "string" && v.trim())))
    : [];
}

function normalizeProfile(value: any): SkillProfile {
  const p = value && typeof value === "object" ? value : {};
  return {
    proficiency: PROFICIENCIES.includes(p.proficiency)
      ? p.proficiency
      : "beginner",
    knows: stringArray(p.knows),
    struggledWith: stringArray(p.struggledWith),
    notes: typeof p.notes === "string" ? p.notes : undefined,
  };
}

export function loadProfiles(): ProfilePayload {
  const filePath = profilesPath();
  if (!existsSync(filePath)) return { apps: {} };
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const apps =
      parsed && typeof parsed.apps === "object" && parsed.apps ? parsed.apps : {};
    return {
      apps: Object.fromEntries(
        Object.entries(apps).map(([k, v]) => [k, normalizeProfile(v)]),
      ),
    };
  } catch (error) {
    safeError("[Specter] Failed to load skill profiles:", error);
    return { apps: {} };
  }
}

function saveProfiles(payload: ProfilePayload): void {
  const filePath = profilesPath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

/** Profile for one app, or null if we've never seen it. */
export function getProfile(app: string): SkillProfile | null {
  return loadProfiles().apps[app] ?? null;
}

/** Replace the stored profile for an app. */
export function setProfile(app: string, profile: SkillProfile): void {
  const payload = loadProfiles();
  payload.apps[app] = normalizeProfile(profile);
  saveProfiles(payload);
}

/**
 * A 2–3 sentence summary injected into the planner prompt. Empty string when
 * there's no history, so the planner just teaches from scratch.
 */
export function profileSummary(app: string): string {
  const p = getProfile(app);
  if (!p) return "";
  const parts: string[] = [`The user is ${p.proficiency} with ${app}.`];
  if (p.knows.length) parts.push(`They already know: ${p.knows.join(", ")}.`);
  if (p.struggledWith.length)
    parts.push(`They have struggled with: ${p.struggledWith.join(", ")}.`);
  return parts.join(" ");
}

/**
 * Seed a fake prior session so the memory demo works on a single live run.
 * Idempotent-ish: only seeds if the app has no profile yet.
 */
export function seedDemoProfile(app = "Gmail"): void {
  if (getProfile(app)) return;
  setProfile(app, {
    proficiency: "beginner+",
    knows: ["composing", "sending"],
    struggledWith: ["attachments"],
    notes: "Seeded prior session.",
  });
}
