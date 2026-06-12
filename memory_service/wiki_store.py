import os
import glob

class WikiStore:
    def __init__(self, root_dir: str):
        self.root_dir = root_dir
        if not os.path.exists(root_dir):
            os.makedirs(root_dir, exist_ok=True)

    def list_files(self):
        pattern = os.path.join(self.root_dir, "**", "*.md")
        return glob.glob(pattern, recursive=True)

    def read_file(self, filepath: str):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            return None

    def _tokenize(self, text: str) -> set:
        import re
        stopwords = {"a", "an", "the", "and", "or", "but", "how", "do", "does", "did", "i", "me", "my", "we", "you", "from", "this", "that", "to", "of", "in", "on", "for", "with", "is", "are", "be"}
        tokens = re.split(r'[^a-zA-Z0-9]', text.lower())
        valid_tokens = set()
        for t in tokens:
            if not t:
                continue
            if t in stopwords:
                continue
            if len(t) <= 2 and not t.isdigit():
                continue
            valid_tokens.add(t)
        return valid_tokens

    def extract_steps(self, content: str) -> list[str]:
        steps = []
        import re

        # Try to find ## Steps or similar
        steps_match = re.search(r'##\s*Steps(.*?)(?:##|\Z)', content, re.DOTALL | re.IGNORECASE)
        if steps_match:
            steps_section = steps_match.group(1)
            # Extract numbered lists or bullet points
            lines_section = steps_section.strip().split('\n')
            for l in lines_section:
                l = l.strip()
                if not l:
                    continue
                # Match "1. " or "- " or "* "
                match = re.match(r'^(?:\d+\.|\-|\*)\s+(.*)', l)
                if match:
                    steps.append(match.group(1))

        # If no explicit steps, try to find any list items in the whole document
        if not steps:
            lines_section = content.strip().split('\n')
            for l in lines_section:
                l = l.strip()
                if not l:
                    continue
                match = re.match(r'^(?:\d+\.|\-|\*)\s+(.*)', l)
                if match:
                    steps.append(match.group(1))

        return steps

    def search_fallback(self, query: str, top_k: int = 3, threshold: float = 0.1):
        import re
        results = []
        files = self.list_files()

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        for f in files:
            content = self.read_file(f)
            if not content:
                continue

            slug = os.path.basename(f)
            title = slug
            first_line = content.split('\n')[0].strip()
            if first_line.startswith('# '):
                title = first_line[2:]

            # Extract headings
            headings = "\n".join(re.findall(r'^#+\s+(.*)$', content, re.MULTILINE))

            slug_tokens = self._tokenize(slug)
            title_tokens = self._tokenize(title)
            heading_tokens = self._tokenize(headings)
            body_tokens = self._tokenize(content)

            score = 0.0
            for qt in query_tokens:
                if qt in title_tokens:
                    score += 5.0
                elif qt in heading_tokens:
                    score += 3.0
                elif qt in body_tokens or qt in slug_tokens:
                    score += 1.0

            if score >= threshold:
                results.append({
                    "id": f,
                    "title": title,
                    "path": slug,
                    "content": content[:1500] + "..." if len(content) > 1500 else content,
                    "score": score
                })

        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]
