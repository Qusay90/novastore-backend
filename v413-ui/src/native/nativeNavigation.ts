const NATIVE_HISTORY_DEPTH = "novastoreDepth";

export function nativeHistoryDepth(state: unknown) {
  if (!state || typeof state !== "object") return 0;
  const depth = (state as Record<string, unknown>)[NATIVE_HISTORY_DEPTH];
  return typeof depth === "number" && Number.isSafeInteger(depth) && depth >= 0 ? depth : 0;
}

export function nativeHistoryState(state: unknown, depth: number) {
  const base = state && typeof state === "object" ? state as Record<string, unknown> : {};
  return { ...base, [NATIVE_HISTORY_DEPTH]: depth };
}

export function hasAppOwnedBackEntry(
  native: boolean,
  state: unknown,
  browserHistoryLength: number,
) {
  if (native) return nativeHistoryDepth(state) > 0;
  return Boolean(state) && browserHistoryLength > 1;
}

type NativeBackDependencies = {
  dismissTransientSurface: () => boolean;
  historyState: unknown;
  historyBack: () => void;
  minimizeApp: () => void | Promise<void>;
};

export type NativeBackOutcome = "dismissed" | "history" | "minimized";

export function handleNativeBack({
  dismissTransientSurface,
  historyState,
  historyBack,
  minimizeApp,
}: NativeBackDependencies): NativeBackOutcome {
  if (dismissTransientSurface()) return "dismissed";
  if (nativeHistoryDepth(historyState) > 0) {
    historyBack();
    return "history";
  }
  void minimizeApp();
  return "minimized";
}
