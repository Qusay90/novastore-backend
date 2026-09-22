import { appendUnique } from "../adapters/publicPagination.js";

const empty = () => ({ items: [], pagination: null, phase: "idle", error: null, data: null });

// One traversal per resource/filter identity. Generation checks also cover transports
// that resolve after cancellation, refresh during append, and component disposal.
export function createCursorTraversal(load, publish = () => {}) {
  let state = empty(), generation = 0, controller, pending = false;
  const emit = (next) => { state = next; publish(state); };
  const cancel = () => { generation++; controller?.abort(); pending = false; };
  const request = async (append) => {
    if (pending || (append && !state.pagination?.hasMore)) return;
    const ticket = generation;
    const cursor = append ? state.pagination.nextCursor : undefined;
    controller = new AbortController();
    const signal = controller.signal;
    pending = true;
    emit({ ...state, phase: append ? "appending" : "loading", error: null });
    try {
      const page = await load({ cursor, signal });
      if (ticket !== generation || signal.aborted) return;
      if (append && page.pagination.hasMore && page.pagination.nextCursor === cursor) throw new Error("Devam bilgisi yenilenemedi. Listeyi yenileyin.");
      emit({ items: appendUnique(append ? state.items : [], page.items), pagination: page.pagination,
        data: page, phase: "ready", error: null });
    } catch (error) {
      if (ticket === generation && !signal.aborted) emit({ ...state, phase: append ? "append-error" : "error", error });
    } finally { if (ticket === generation) pending = false; }
  };
  return {
    snapshot: () => state,
    refresh: () => { cancel(); emit(empty()); return request(false); },
    more: () => request(true),
    dispose: cancel,
  };
}
