import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentCustomerSessionGuard,
  customerSessionMatchesGuard,
  CustomerNotificationApiError,
} from "../notifications/customerNotificationApi";
import {
  followCustomerStore,
  getCustomerStoreFollowState,
  unfollowCustomerStore,
} from "./customerAccountApi";

export type CustomerStoreFollowAccountPhase = "loading" | "guest" | "authenticated" | "offline" | "error";
export type CustomerStoreFollowPhase = "disabled" | "loading" | "guest" | "ready" | "error";

export type CustomerStoreFollowRuntimeOptions = Readonly<{
  storeSlug: string;
  enabled: boolean;
  accountPhase: CustomerStoreFollowAccountPhase;
  customerId: number | null;
  refreshFollowedStores?: (() => Promise<void>) | null;
}>;

export type CustomerStoreFollowRuntimeValue = Readonly<{
  phase: CustomerStoreFollowPhase;
  confirmed: boolean;
  following: boolean;
  followerCount: number;
  busy: boolean;
  errorMessage: string;
  refresh(): void;
  setFollowing(nextFollowing: boolean): Promise<boolean>;
  toggle(): Promise<boolean>;
}>;

type FollowSnapshot = Readonly<{
  phase: CustomerStoreFollowPhase;
  confirmed: boolean;
  following: boolean;
  followerCount: number;
  busy: boolean;
  errorMessage: string;
}>;

const emptySnapshot = (phase: CustomerStoreFollowPhase, errorMessage = ""): FollowSnapshot => Object.freeze({
  phase,
  confirmed: false,
  following: false,
  followerCount: 0,
  busy: false,
  errorMessage,
});

function visibleError(error: unknown, fallback: string) {
  return error instanceof CustomerNotificationApiError && error.message.trim()
    ? error.message.trim()
    : fallback;
}

/**
 * Server-authoritative lifecycle for the follow button on a Customer store route.
 *
 * No optimistic follow truth is emitted: GET establishes the initial state and
 * POST/DELETE response bodies establish every later state. Session guards and a
 * route lifecycle sequence quarantine late responses after an account or route
 * change. The Account collection refresh runs only after a confirmed mutation.
 */
export function useCustomerStoreFollowRuntime({
  storeSlug,
  enabled,
  accountPhase,
  customerId,
  refreshFollowedStores,
}: CustomerStoreFollowRuntimeOptions): CustomerStoreFollowRuntimeValue {
  const [snapshot, setSnapshot] = useState<FollowSnapshot>(() => emptySnapshot("disabled"));
  const [refreshSequence, setRefreshSequence] = useState(0);
  const snapshotRef = useRef(snapshot);
  const mountedRef = useRef(true);
  const lifecycleSequence = useRef(0);
  const mutationSequence = useRef(0);
  const mutationInFlight = useRef(false);
  const refreshFollowedStoresRef = useRef(refreshFollowedStores);

  snapshotRef.current = snapshot;
  refreshFollowedStoresRef.current = refreshFollowedStores;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ++lifecycleSequence.current;
      ++mutationSequence.current;
      mutationInFlight.current = false;
    };
  }, []);

  useEffect(() => {
    const currentLifecycle = ++lifecycleSequence.current;
    ++mutationSequence.current;
    mutationInFlight.current = false;

    if (!enabled) {
      setSnapshot(emptySnapshot("disabled"));
      return undefined;
    }
    if (accountPhase === "guest") {
      setSnapshot(emptySnapshot("guest", "Mağaza takibi için müşteri hesabına giriş yapmalısın."));
      return undefined;
    }
    if (accountPhase !== "authenticated" || !Number.isSafeInteger(customerId) || Number(customerId) < 1) {
      const unavailable = accountPhase === "loading"
        ? emptySnapshot("loading")
        : emptySnapshot("error", "Müşteri oturumu doğrulanmadan mağaza takip durumu gösterilemez.");
      setSnapshot(unavailable);
      return undefined;
    }

    const guard = currentCustomerSessionGuard();
    setSnapshot(emptySnapshot("loading"));
    void getCustomerStoreFollowState(storeSlug).then((state) => {
      if (
        !mountedRef.current
        || lifecycleSequence.current !== currentLifecycle
        || !customerSessionMatchesGuard(guard)
      ) return;
      setSnapshot(Object.freeze({
        phase: "ready",
        confirmed: true,
        following: state.following,
        followerCount: state.followerCount,
        busy: false,
        errorMessage: "",
      }));
    }).catch((error: unknown) => {
      if (
        !mountedRef.current
        || lifecycleSequence.current !== currentLifecycle
        || !customerSessionMatchesGuard(guard)
      ) return;
      setSnapshot(emptySnapshot("error", visibleError(error, "Mağaza takip durumu sunucudan alınamadı.")));
    });

    return () => {
      if (lifecycleSequence.current === currentLifecycle) ++lifecycleSequence.current;
      ++mutationSequence.current;
      mutationInFlight.current = false;
    };
  }, [accountPhase, customerId, enabled, refreshSequence, storeSlug]);

  const refresh = useCallback(() => setRefreshSequence((current) => current + 1), []);

  const setFollowing = useCallback(async (nextFollowing: boolean) => {
    const lastConfirmed = snapshotRef.current;
    if (!enabled) {
      setSnapshot(emptySnapshot("disabled"));
      return false;
    }
    if (accountPhase !== "authenticated" || !Number.isSafeInteger(customerId) || Number(customerId) < 1) {
      setSnapshot(emptySnapshot("guest", "Mağaza takibi için müşteri hesabına giriş yapmalısın."));
      return false;
    }
    if (!lastConfirmed.confirmed || lastConfirmed.phase !== "ready" || mutationInFlight.current) return false;
    if (lastConfirmed.following === nextFollowing) return true;

    mutationInFlight.current = true;
    const currentLifecycle = lifecycleSequence.current;
    const currentMutation = ++mutationSequence.current;
    const guard = currentCustomerSessionGuard();
    setSnapshot(Object.freeze({ ...lastConfirmed, busy: true, errorMessage: "" }));

    try {
      const state = nextFollowing
        ? await followCustomerStore(storeSlug)
        : await unfollowCustomerStore(storeSlug);
      if (
        !mountedRef.current
        || lifecycleSequence.current !== currentLifecycle
        || mutationSequence.current !== currentMutation
        || !customerSessionMatchesGuard(guard)
      ) return false;

      const serverConfirmed = Object.freeze({
        phase: "ready" as const,
        confirmed: true,
        following: state.following,
        followerCount: state.followerCount,
        busy: true,
        errorMessage: "",
      });
      setSnapshot(serverConfirmed);

      try {
        await refreshFollowedStoresRef.current?.();
      } catch {
        if (
          mountedRef.current
          && lifecycleSequence.current === currentLifecycle
          && mutationSequence.current === currentMutation
          && customerSessionMatchesGuard(guard)
        ) {
          setSnapshot(Object.freeze({
            ...serverConfirmed,
            busy: false,
            errorMessage: "Takip durumu sunucuda doğrulandı ancak hesap mağaza listesi yenilenemedi.",
          }));
        }
        return true;
      }

      if (
        mountedRef.current
        && lifecycleSequence.current === currentLifecycle
        && mutationSequence.current === currentMutation
        && customerSessionMatchesGuard(guard)
      ) {
        setSnapshot(Object.freeze({ ...serverConfirmed, busy: false }));
      }
      return true;
    } catch (error) {
      if (
        mountedRef.current
        && lifecycleSequence.current === currentLifecycle
        && mutationSequence.current === currentMutation
        && customerSessionMatchesGuard(guard)
      ) {
        setSnapshot(Object.freeze({
          ...lastConfirmed,
          busy: false,
          errorMessage: visibleError(error, "Mağaza takip işlemi tamamlanamadı."),
        }));
      }
      return false;
    } finally {
      if (mutationSequence.current === currentMutation) mutationInFlight.current = false;
    }
  }, [accountPhase, customerId, enabled, storeSlug]);

  const toggle = useCallback(
    () => setFollowing(!snapshotRef.current.following),
    [setFollowing],
  );

  return Object.freeze({ ...snapshot, refresh, setFollowing, toggle });
}
