import { execFile } from "child_process";
import { promisify } from "util";
import { safeWarn } from "../logger";

const execFileAsync = promisify(execFile);

const APPLESCRIPT_BY_BUNDLE: Record<string, string> = {
  "com.google.Chrome":
    'tell application "Google Chrome" to get URL of active tab of front window',
  "com.apple.Safari":
    'tell application "Safari" to get URL of current tab of front window',
  "com.microsoft.edgemac":
    'tell application "Microsoft Edge" to get URL of active tab of front window',
  "company.thebrowser.Browser":
    'tell application "Arc" to get URL of active tab of front window',
  "com.brave.Browser":
    'tell application "Brave Browser" to get URL of active tab of front window',
};

export async function probeBrowserUrl(
  bundleId: string | null,
): Promise<string | null> {
  if (process.platform !== "darwin" || !bundleId) return null;
  const script = APPLESCRIPT_BY_BUNDLE[bundleId];
  if (!script) return null;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 2_500,
    });
    const url = stdout.trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch (error) {
    safeWarn("[CONTEXT] browser URL probe failed", {
      bundleId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
