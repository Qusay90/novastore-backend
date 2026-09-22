import { useCallback, useEffect, useMemo, useState } from "react";
import { createCommerceRuntime } from "./createCommerceRuntime.js";

export function useCommerceRuntime({
  readOnlyPreview = false,
  allowEmptyCatalog = false,
  allowUnavailableCatalog = false,
} = {}) {
  const runtimeFactory = useMemo(() => createCommerceRuntime(), []);
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState({
    phase: "loading",
    runtime: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResource({ phase: "loading", runtime: null, error: null });
    runtimeFactory.initialize({
      signal: controller.signal,
      readOnlyPreview,
      allowUnavailableCatalog,
    }).then((runtime) => {
      if (!active) return;
      const empty = runtime.catalog.categories.length === 0 || runtime.catalog.products.length === 0;
      setResource({ phase: empty && !allowEmptyCatalog ? "empty" : "ready", runtime, error: null });
    }).catch((error) => {
      if (!active || error?.code === "STOREFRONT_ABORTED") return;
      setResource({ phase: "error", runtime: null, error });
    });
    return () => {
      active = false;
      controller.abort("effect-cleanup");
    };
  }, [allowEmptyCatalog, allowUnavailableCatalog, attempt, readOnlyPreview, runtimeFactory]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return Object.freeze({ ...resource, retry });
}
