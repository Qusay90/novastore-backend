import { useCallback, useEffect, useRef, useState } from "react";

const initialState = Object.freeze({
  phase: "idle",
  data: null,
  error: null,
  refreshing: false,
  updatedAt: null,
});

export function useResource(loader, { enabled = true, preserveDataOnError = true } = {}) {
  const [state, setState] = useState(initialState);
  const [revision, setRevision] = useState(0);
  const requestRef = useRef(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      requestRef.current += 1;
      setState(initialState);
      return undefined;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();

    setState((current) => ({
      ...current,
      phase: current.data ? current.phase : "loading",
      error: null,
      refreshing: Boolean(current.data),
    }));

    Promise.resolve(loader({ signal: controller.signal }))
      .then((data) => {
        if (controller.signal.aborted || requestRef.current !== requestId) return;
        const empty = Array.isArray(data) && data.length === 0;
        setState({
          phase: empty ? "empty" : "ready",
          data,
          error: null,
          refreshing: false,
          updatedAt: new Date(),
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError" || requestRef.current !== requestId) return;
        setState((current) => {
          const canPreserveData = preserveDataOnError
            && currentErrorMayPreserveData(error)
            && current.data !== null;
          return canPreserveData
            ? { ...current, error, refreshing: false }
            : {
                phase: error?.status === 403 ? "forbidden" : "error",
                data: null,
                error,
                refreshing: false,
                updatedAt: null,
              };
        });
      });

    return () => controller.abort();
  }, [enabled, loader, preserveDataOnError, revision]);

  return { ...state, reload };
}

export function currentErrorMayPreserveData(error) {
  return error?.status !== 401 && error?.status !== 403;
}
