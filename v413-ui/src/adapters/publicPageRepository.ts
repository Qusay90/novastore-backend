import type { PublicPage } from "./publicPagination";
export type PublicFailure = "error" | "offline" | "unavailable";
export function publicFailure(error: unknown): PublicFailure {
  const status = Number((error as { status?: number })?.status);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if ([401, 403, 404, 503].includes(status)) return "unavailable";
  return "error";
}
export type PublicPageState<T, M> = Readonly<{
  phase: "loading" | "ready" | PublicFailure;
  items: readonly T[]; summary: M | undefined; hasMore: boolean; nextCursor: string | null;
  appending: boolean; appendError: PublicFailure | null;
}>;
/** A page traversal owns its request generation and identities; display caches never own completeness. */
export function createPublicPageRepository<T extends { id: string | number }, M>(
  load: (cursor?: string) => Promise<PublicPage<T, M>>,
) {
  let generation = 0;
  let active = true;
  let busy = false;
  let cursors = new Set<string>();
  let state: PublicPageState<T, M> = Object.freeze({
    phase: "loading", items: [], summary: undefined, hasMore: false, nextCursor: null,
    appending: false, appendError: null,
  });
  const listeners = new Set<() => void>();
  const publish = (value: PublicPageState<T, M>) => { state = Object.freeze(value); listeners.forEach(listener => listener()); };
  const run = async (append: boolean) => {
    if (append && (busy || !active || !state.hasMore || !state.nextCursor)) return;
    if (!append) { active = true; generation++; cursors = new Set(); }
    const ticket = generation;
    const cursor = append ? state.nextCursor! : undefined;
    busy = true;
    publish(append ? { ...state, appending: true, appendError: null } : {
      phase: "loading", items: [], summary: undefined, hasMore: false, nextCursor: null, appending: false, appendError: null,
    });
    try {
      const page = await load(cursor);
      if (!active || ticket !== generation) return;
      if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor || cursors.has(page.nextCursor))) throw new Error("PUBLIC_CURSOR_NOT_PROGRESSING");
      if (cursor) cursors.add(cursor);
      const items = new Map((append ? state.items : []).map(item => [String(item.id), item]));
      page.items.forEach(item => items.set(String(item.id), item));
      publish({ phase: "ready", items: [...items.values()], summary: page.summary,
        hasMore: page.hasMore, nextCursor: page.nextCursor, appending: false, appendError: null });
    } catch (error) {
      if (!active || ticket !== generation) return;
      publish(append ? { ...state, appending: false, appendError: publicFailure(error) }
        : { ...state, phase: publicFailure(error), appending: false });
    } finally { if (ticket === generation) busy = false; }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh: () => run(false),
    loadMore: () => run(true),
    dispose: () => { active = false; generation++; busy = false; },
  };
}
