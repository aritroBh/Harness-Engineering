export interface WikiPageMeta {
  id: string;
  title: string;
  sourceSessionId: string;
  timestamp: string;
  confidence: number;
  tags: string[];
}

export interface WikiPage {
  meta: WikiPageMeta;
  content: string; // Markdown string
}
