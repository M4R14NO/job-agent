import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

export function useJobDescription(job) {
  return useMemo(() => {
    // Prefer pre-rendered clean HTML from the backend (no Markdown round-trip).
    if (job?.description_html) {
      return DOMPurify.sanitize(job.description_html);
    }
    // Fallback: render legacy Markdown-formatted descriptions.
    const raw = job?.description;
    if (!raw) return "";
    const html = marked.parse(raw);
    return DOMPurify.sanitize(html);
  }, [job]);
}
