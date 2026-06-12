import * as fs from "fs";
import * as path from "path";

let walkthroughSafetyChecked = false;

function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  if (start === -1) return "";

  const bodyStart = source.indexOf("{", start);
  if (bodyStart === -1) return "";

  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }

  return source.slice(start);
}

export function assertWalkthroughReplaySafety(): void {
  if (walkthroughSafetyChecked || process.env.NODE_ENV === "production") return;
  walkthroughSafetyChecked = true;

  const replayPath = path.join(process.cwd(), "src/main/session/replay.ts");
  if (!fs.existsSync(replayPath)) return;

  const source = fs.readFileSync(replayPath, "utf-8");
  const walkthroughBody = functionSource(source, "replayWalkthrough");

  const forbiddenImport = source.match(
    /from\s+['"](\.\.\/cursor|\.\/cursor)['"]|@nut-tree-fork\/nut-js/,
  );
  const forbiddenCall = walkthroughBody.match(
    /\b(moveRealMouse|clickRealMouse|executeRealMouseSteps|mouse\.(move|click|scrollDown|scrollUp)|keyboard\.type|straightTo|Button\.LEFT)\b/,
  );

  if (forbiddenImport || forbiddenCall) {
    throw new Error(
      `[WALKTHROUGH] DEV SAFETY GUARD: replayWalkthrough must not import or call real mouse automation. Matched: ${
        forbiddenImport?.[0] || forbiddenCall?.[0]
      }`,
    );
  }
}
