import os
import json
from .schemas import LintIssue
from .wiki_store import WikiStore

class LintEngine:
    def __init__(self, wiki_store: WikiStore):
        self.wiki_store = wiki_store

    def run_all_rules(self, graph_path: str = None) -> list[LintIssue]:
        issues = []
        issues.extend(self.check_graph_rules(graph_path))
        return issues

    def check_graph_rules(self, graph_path: str) -> list[LintIssue]:
        issues = []
        if not graph_path or not os.path.exists(graph_path):
            return issues

        try:
            with open(graph_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Rule: synthetic: true missing
            if not data.get("synthetic", False):
                issues.append(LintIssue(
                    rule="synthetic-data-label",
                    message="Demo workflow graph is missing 'synthetic: true' label.",
                    file=graph_path
                ))

            sessions = data.get("sessions", [])
            for session in sessions:
                # Rule: missing success condition
                if not session.get("successCondition"):
                    issues.append(LintIssue(
                        rule="missing-success-condition",
                        message=f"Session {session.get('id', 'unknown')} is missing a success condition.",
                        file=graph_path
                    ))

                steps = session.get("steps", [])
                for idx, step in enumerate(steps):
                    action = step.get("action")
                    if action in ["click", "type", "submit", "replay"]:
                        # Rule: missing app name
                        if not step.get("appName"):
                            issues.append(LintIssue(
                                rule="missing-app-name",
                                message=f"Step {idx} in session {session.get('id', 'unknown')} is missing appName.",
                                file=graph_path
                            ))

                        # Rule: missing coordinate frame
                        if not step.get("coordinateFrame"):
                            issues.append(LintIssue(
                                rule="missing-coordinate-frame",
                                message=f"Step {idx} in session {session.get('id', 'unknown')} is missing coordinateFrame.",
                                file=graph_path
                            ))

                        # Rule: low confidence target
                        if step.get("targetConfidence") is not None and step.get("targetConfidence") < 0.65:
                            issues.append(LintIssue(
                                rule="low-confidence-target",
                                message=f"Step {idx} has targetConfidence below 0.65.",
                                file=graph_path
                            ))

                        # Rule: unsafe action without confirmation
                        is_unsafe = False
                        if step.get("requiresConfirmation") or step.get("requires_confirmation") or step.get("unsafe") or step.get("destructive"):
                            is_unsafe = True
                        else:
                            unsafe_keywords = {"delete", "remove", "submit", "send", "purchase", "pay", "checkout", "confirm", "invite", "email", "message", "publish", "post", "upload", "download", "overwrite", "replace", "archive"}
                            haystack = (step.get("actionType") or "") + " " + (step.get("instruction") or "") + " " + (step.get("targetLabel") or "")
                            for kw in unsafe_keywords:
                                if kw in haystack.lower():
                                    is_unsafe = True
                                    break

                        if is_unsafe and not step.get("requiresConfirmation"):
                            issues.append(LintIssue(
                                rule="unsafe-action-without-confirmation",
                                message=f"Step {idx} appears unsafe but requiresConfirmation is not true.",
                                file=graph_path
                            ))

        except Exception as e:
            issues.append(LintIssue(
                rule="lint-error",
                message=f"Failed to parse graph for linting: {e}",
                file=graph_path
            ))

        return issues
