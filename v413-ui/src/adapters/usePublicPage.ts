import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPublicPageRepository } from "./publicPageRepository";
import type { PublicPage } from "./publicPagination";
export function usePublicPage<T extends { id: string | number }, M>(
  key: string,
  load: (cursor?: string) => Promise<PublicPage<T, M>>,
  enabled = true,
) {
  // key is the complete resource/filter identity. A changed key starts with no old surface data.
  const repository = useMemo(() => createPublicPageRepository(load), [key]);
  const state = useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);
  useEffect(() => {
    if (enabled) void repository.refresh();
    return repository.dispose;
  }, [repository, enabled]);
  return { ...state, refresh: repository.refresh, loadMore: repository.loadMore };
}
