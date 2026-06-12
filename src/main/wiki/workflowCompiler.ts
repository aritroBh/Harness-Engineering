import { Session, Step } from "../session/types";
import { WikiPage } from "./types";

function buildStepMarkdown(step: Step, index: number): string {
  let md = `${index + 1}. **Action**: \`${step.action}\``;
  if (step.targetLabel) md += ` on **${step.targetLabel}**`;
  if (step.typeText) md += ` (typed: "${step.typeText}")`;
  if (step.instruction) md += `\n   - Intent: *${step.instruction}*`;

  if (step.action === "wait" && step.delayMs) {
    md += `\n   - Waited ${step.delayMs}ms`;
  }

  return md;
}

export function compileSessionToWiki(
  session: Session,
  appName: string,
): WikiPage[] {
  const pages: WikiPage[] = [];
  const timestamp = session.timestamp || new Date().toISOString();

  // 1. Overview Page
  const overviewId = `workflow-${session.id}`;
  let overviewContent = `This is a recorded workflow for **${appName}**.\n\n`;
  overviewContent += `## Steps\n`;
  session.steps.forEach((step, i) => {
    overviewContent += buildStepMarkdown(step, i) + "\n";
  });
  overviewContent += `\n## Related\n- [[app-${appName.toLowerCase().replace(/\\s+/g, "-")}]]\n`;

  pages.push({
    meta: {
      id: overviewId,
      title: `Workflow: ${session.id}`,
      sourceSessionId: session.id,
      timestamp,
      confidence: 1.0,
      tags: ["workflow", appName],
    },
    content: overviewContent,
  });

  // 2. Target Extraction (generate a page for significant targets)
  session.steps.forEach((step, i) => {
    if (step.targetLabel && step.action === "click") {
      const targetId = `target-${step.targetLabel.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      let targetContent = `Observed UI element: **${step.targetLabel}** in app **${appName}**.\n\n`;
      targetContent += `It was clicked in [[${overviewId}]] at step ${i + 1}.\n`;
      if (step.rawTarget) {
        targetContent += `\nCoordinate frame: ${step.rawTarget.coordinateFrame}\n`;
      }

      // Avoid exact duplicates in this simple compilation
      if (!pages.find((p) => p.meta.id === targetId)) {
        pages.push({
          meta: {
            id: targetId,
            title: `UI Element: ${step.targetLabel}`,
            sourceSessionId: session.id,
            timestamp,
            confidence: 0.9,
            tags: ["ui-element", appName],
          },
          content: targetContent,
        });
      }
    }
  });

  return pages;
}

export function compileCorrectionToWiki(
  sourceSessionId: string,
  feedbackType: "correct" | "wrong" | "missing-step",
  details: string,
  originalQuery?: string,
): WikiPage {
  const timestamp = new Date().toISOString();
  const id = `correction-${Date.now()}`;

  let content = `Feedback received: **${feedbackType}**\n\n`;
  if (originalQuery) {
    content += `Original Query: ${originalQuery}\n\n`;
  }
  content += `Correction Text: ${details}\n\n`;
  content += `Timestamp: ${timestamp}\n\n`;
  content += `Reference: [[workflow-${sourceSessionId}]]\n`;

  return {
    meta: {
      id,
      title: `Correction: ${feedbackType}`,
      sourceSessionId,
      timestamp,
      confidence: 1.0,
      tags: ["correction", feedbackType],
    },
    content,
  };
}
