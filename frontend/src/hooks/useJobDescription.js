import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

export function useJobDescription(job) {
  return useMemo(() => {
    const raw = job?.description;
    if (!raw) return "";
    const html = marked.parse(raw, { breaks: true });
    return DOMPurify.sanitize(html);
  }, [job]);
}
