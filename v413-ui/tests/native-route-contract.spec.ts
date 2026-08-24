import { expect, test } from "@playwright/test";
import {
  hasAppOwnedBackEntry,
  handleNativeBack,
  nativeHistoryDepth,
  nativeHistoryState,
} from "../src/native/nativeNavigation";
import {
  CANONICAL_NATIVE_ROUTE_TUPLES,
  canonicalNativeRoute,
  canonicalNativeRouteOrSafeDefault,
  nativeRouteFromAppUrl,
} from "../src/native/routeContract";

const canonicalStates = [
  ["CAL-01", "account", "login"], ["CAL-01", "account", "forgot"],
  ["CAL-01", "account", "register"], ["CAL-02", "home", ""],
  ["CAL-02", "home", "search"], ["CAL-03", "categories", ""],
  ["CAL-04", "home", ""], ["CAL-04", "favorites", ""],
  ["CAL-04", "home", "store"], ["CAL-05", "home", ""],
  ["CAL-06", "home", ""], ["CAL-07", "cart", ""],
  ["CAL-08", "cart", ""], ["CAL-08", "cart", "address"],
  ["CAL-08", "cart", "success"], ["CAL-09", "account", ""],
  ["CAL-09", "account", "invoice"], ["CAL-09", "account", "tracking"],
  ["CAL-10", "account", ""], ["CAL-10", "account", "returns"],
  ["CAL-10", "account", "faq"], ["CAL-10", "account", "history"],
  ["CAL-10", "account", "addresses"], ["CAL-10", "account", "notifications"],
  ["CAL-10", "account", "profile"], ["CAL-10", "account", "payments"],
  ["CAL-10", "account", "coupons"], ["CAL-10", "account", "reviews"],
  ["CAL-10", "account", "questions"], ["CAL-10", "account", "security"],
  ["CAL-10", "account", "settings"], ["CAL-11", "support", ""],
  ["CAL-11", "support", "faq"], ["CAL-11", "support", "history"],
  ["CAL-11", "support", "live"], ["CAL-12", "support", ""],
] as const;

test("native route allowlist contains exactly the 36 owner states", () => {
  expect(canonicalStates).toHaveLength(36);
  expect(CANONICAL_NATIVE_ROUTE_TUPLES).toEqual(canonicalStates);
  const outputs = new Set<string>();
  for (const [cal, tab, view] of canonicalStates) {
    const source = new URLSearchParams({ cal, tab });
    if (view) source.set("view", view);
    const route = canonicalNativeRoute(source);
    expect(route, `${cal}/${tab}/${view || "root"}`).not.toBeNull();
    expect(route?.get("shell")).toBe("native");
    outputs.add(route!.toString());
  }
  expect(outputs.size).toBe(36);
});

test("every explicit cal, tab, and view permutation is either canonical or rejected", () => {
  const cals = [...new Set(canonicalStates.map(([cal]) => cal)), "CAL-99"];
  const tabs = [...new Set(canonicalStates.map(([, tab]) => tab)), "unknown"];
  const views = [...new Set(canonicalStates.map(([, , view]) => view)), "unknown"];
  const canonicalKeys = new Set(canonicalStates.map((route) => route.join("/")));

  for (const cal of cals) {
    for (const tab of tabs) {
      for (const view of views) {
        const source = new URLSearchParams({ cal, tab, view });
        const route = canonicalNativeRoute(source);
        const inputKey = `${cal}/${tab}/${view}`;
        const isLoginRootAlias = inputKey === "CAL-01/account/";
        if (!canonicalKeys.has(inputKey) && !isLoginRootAlias) {
          expect(route, inputKey).toBeNull();
          continue;
        }

        expect(route, inputKey).not.toBeNull();
        const outputKey = [route!.get("cal"), route!.get("tab"), route!.get("view") ?? ""].join("/");
        expect(canonicalKeys.has(outputKey), `${inputKey} -> ${outputKey}`).toBe(true);
      }
    }
  }
});

test("CAL-01 root aliases login and rejected native history input resolves to safe Home", () => {
  expect(canonicalNativeRoute(new URLSearchParams("cal=CAL-01&tab=account"))?.toString())
    .toBe("cal=CAL-01&tab=account&view=login&shell=native");
  expect(canonicalNativeRouteOrSafeDefault(new URLSearchParams(
    "cal=CAL-10&tab=support&view=faq&token=do-not-keep",
  )).toString()).toBe("cal=CAL-02&tab=home&shell=native");
});

test("native route parser rejects illegal combinations and strips debug or secret parameters", () => {
  for (const query of [
    "cal=CAL-99&tab=home",
    "cal=CAL-04&tab=cart",
    "cal=CAL-04&tab=favorites&view=store",
    "cal=CAL-10&tab=account&view=unknown",
  ]) {
    expect(canonicalNativeRoute(new URLSearchParams(query)), query).toBeNull();
  }

  const clean = canonicalNativeRoute(new URLSearchParams(
    "cal=CAL-06&tab=home&capture=1&device=Pixel10&token=secret&view=",
  ));
  expect(clean?.toString()).toBe("cal=CAL-06&tab=home&shell=native");
});

test("public store and PDP route context is typed, bounded, and preview fails closed", () => {
  expect(canonicalNativeRoute(new URLSearchParams(
    "cal=CAL-04&tab=home&view=store&storeSlug=main6v-nova-teknoloji&mode=preview&token=secret",
  ))?.toString()).toBe(
    "cal=CAL-04&tab=home&view=store&storeSlug=main6v-nova-teknoloji&mode=preview&shell=native",
  );
  expect(canonicalNativeRoute(new URLSearchParams(
    "cal=CAL-06&tab=home&storeSlug=main6v-nova-teknoloji&productId=201&mode=customer",
  ))?.toString()).toBe(
    "cal=CAL-06&tab=home&storeSlug=main6v-nova-teknoloji&productId=201&mode=customer&shell=native",
  );

  for (const query of [
    "cal=CAL-04&tab=home&view=store&storeSlug=../admin",
    "cal=CAL-04&tab=home&view=store&productId=201",
    "cal=CAL-04&tab=home&view=store&mode=preview",
    "cal=CAL-06&tab=home&storeSlug=main6v-nova-teknoloji&productId=../../secret",
    "cal=CAL-02&tab=home&storeSlug=main6v-nova-teknoloji",
  ]) {
    expect(canonicalNativeRoute(new URLSearchParams(query)), query).toBeNull();
  }
});

test("deep links are origin and path constrained for cold and warm launch", () => {
  expect(nativeRouteFromAppUrl("https://novastore.tr/app/customer?cal=CAL-04&tab=home&view=store"))
    .not.toBeNull();
  expect(nativeRouteFromAppUrl("novastore://customer?cal=CAL-12&tab=support"))
    .not.toBeNull();

  for (const url of [
    "http://novastore.tr/app/customer?cal=CAL-02&tab=home",
    "https://novastore.tr.evil/app/customer?cal=CAL-02&tab=home",
    "https://novastore.tr/other?cal=CAL-02&tab=home",
    "novastore://evil?cal=CAL-02&tab=home",
    "javascript:alert(1)",
    "not a url",
  ]) {
    expect(nativeRouteFromAppUrl(url), url).toBeNull();
  }
});

test("native history depth is fail-closed and app-owned top-bar back ignores raw native history length", () => {
  for (const state of [null, {}, { novastoreDepth: -1 }, { novastoreDepth: 1.5 }, { novastoreDepth: "4" }]) {
    expect(nativeHistoryDepth(state)).toBe(0);
  }
  expect(nativeHistoryDepth({ novastoreDepth: 2 })).toBe(2);
  expect(nativeHistoryState({ route: "kept" }, 3)).toEqual({ route: "kept", novastoreDepth: 3 });

  expect(hasAppOwnedBackEntry(true, { novastoreDepth: 0 }, 99)).toBe(false);
  expect(hasAppOwnedBackEntry(true, { novastoreDepth: 1 }, 1)).toBe(true);
  expect(hasAppOwnedBackEntry(false, { browser: true }, 2)).toBe(true);
  expect(hasAppOwnedBackEntry(false, null, 2)).toBe(false);
});

test("the native back callback dismisses first, owns typed history, and minimizes only at depth zero", () => {
  const calls: string[] = [];
  const invoke = (dismissed: boolean, novastoreDepth: number) => handleNativeBack({
    dismissTransientSurface: () => {
      calls.push("dismiss-check");
      return dismissed;
    },
    historyState: { novastoreDepth },
    historyBack: () => calls.push("history"),
    minimizeApp: () => calls.push("minimize"),
  });

  expect(invoke(true, 4)).toBe("dismissed");
  expect(calls).toEqual(["dismiss-check"]);

  calls.length = 0;
  expect(invoke(false, 1)).toBe("history");
  expect(calls).toEqual(["dismiss-check", "history"]);

  calls.length = 0;
  expect(invoke(false, 0)).toBe("minimized");
  expect(calls).toEqual(["dismiss-check", "minimize"]);
});
