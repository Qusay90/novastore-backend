import { useEffect, useMemo, useState } from "react";
import { createCursorTraversal } from "./cursorTraversal.js";

export function useCursorPage(load, identity, enabled = true) {
  const [published, setPublished] = useState(null);
  const traversal = useMemo(() => createCursorTraversal(load, (state) => setPublished({ identity, state })), [load, identity]);
  useEffect(() => {
    if (enabled) traversal.refresh();
    return () => traversal.dispose();
  }, [traversal, enabled]);
  const state = published?.identity === identity ? published.state : traversal.snapshot();
  return { ...state, refresh: traversal.refresh, more: traversal.more };
}
