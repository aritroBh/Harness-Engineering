import * as fs from "fs";
import * as path from "path";

/**
 * Security check script to prevent leaking API keys.
 * Specifically checks for 'nvapi-' which is the prefix for NVIDIA API keys.
 */

const ROOT_DIR = path.resolve(__dirname, "..");
// Real nvapi keys are 60+ chars; the length floor keeps docs placeholders
// like "nvapi-..." from tripping the check.
const SECRET_VALUE_PATTERN = /nvapi-[A-Za-z0-9._-]{20,}/g;
const SEARCH_PATTERN = SECRET_VALUE_PATTERN.source;

const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "release",
  "build",
]);

const IGNORE_FILE_NAMES = new Set([".env", "security-check.ts"]);

type Finding = {
  file: string;
  line: number;
  preview: string;
};

function relativePath(filePath: string): string {
  return path.relative(ROOT_DIR, filePath) || ".";
}

function redactPreview(line: string): string {
  return line.replace(SECRET_VALUE_PATTERN, "nvapi-[REDACTED]").trim();
}

function findLeakedKeys(dir: string, findings: Finding[]): void {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error: any) {
    throw new Error(
      `Unable to read directory ${relativePath(dir)}: ${error.message}`,
    );
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIR_NAMES.has(entry.name)) {
        findLeakedKeys(fullPath, findings);
      }
      continue;
    }

    if (!entry.isFile() || IGNORE_FILE_NAMES.has(entry.name)) {
      continue;
    }

    let contents: string;
    try {
      contents = fs.readFileSync(fullPath, "utf-8");
    } catch (error: any) {
      throw new Error(
        `Unable to read file ${relativePath(fullPath)}: ${error.message}`,
      );
    }

    contents.split(/\r?\n/).forEach((line, index) => {
      if (line.match(SECRET_VALUE_PATTERN)) {
        findings.push({
          file: relativePath(fullPath),
          line: index + 1,
          preview: redactPreview(line),
        });
      }
    });
  }
}

function runCheck() {
  console.log(`[SECURITY] Checking for leaked keys (${SEARCH_PATTERN})...`);

  try {
    const findings: Finding[] = [];
    findLeakedKeys(ROOT_DIR, findings);

    if (findings.length > 0) {
      console.error(
        "\x1b[31m[SECURITY FAILURE] Found potential leaked NVIDIA API keys:\x1b[0m",
      );
      for (const finding of findings) {
        console.error(`${finding.file}:${finding.line}: ${finding.preview}`);
      }
      process.exit(1);
    }

    console.log("\x1b[32m[SECURITY PASS] No leaked keys found.\x1b[0m");
  } catch (error: any) {
    console.error(
      `\x1b[31m[SECURITY FAILURE] Security check could not complete: ${error.message}\x1b[0m`,
    );
    process.exit(1);
  }
}

runCheck();
