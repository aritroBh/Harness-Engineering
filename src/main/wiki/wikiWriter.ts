import fs from "fs";
import path from "path";
import { safeLog, safeError } from "../logger";
import { WikiPage } from "./types";

export function writeWikiPage(page: WikiPage, rootDir: string): string | null {
  try {
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    const filepath = path.join(rootDir, `${page.meta.id}.md`);

    // Build Markdown with frontmatter
    let md = `---\n`;
    md += `title: ${page.meta.title}\n`;
    md += `sourceSessionId: ${page.meta.sourceSessionId}\n`;
    md += `timestamp: ${page.meta.timestamp}\n`;
    md += `confidence: ${page.meta.confidence}\n`;
    md += `tags: [${page.meta.tags.join(", ")}]\n`;
    md += `---\n\n`;

    md += `# ${page.meta.title}\n\n`;
    md += page.content;

    fs.writeFileSync(filepath, md, "utf-8");
    safeLog(`[WikiWriter] Wrote page: ${page.meta.id}`, { filepath });
    return filepath;
  } catch (error) {
    safeError("[WikiWriter] Failed to write wiki page", error);
    return null;
  }
}
