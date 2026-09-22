// Package keys are unique only within one immutable theme version.
export const assetCacheKey = (ref, versionId) => ref.startsWith('package:') ? `${versionId}:${ref}` : ref;
