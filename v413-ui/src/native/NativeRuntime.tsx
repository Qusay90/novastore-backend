import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { App } from "@capacitor/app";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import {
  DEFAULT_NATIVE_INSETS,
  NativeRuntimeContext,
  type NativeInsets,
} from "./NativeRuntimeContext";
import { NativeKeyboardProvider } from "./mobile/Keyboard";
import {
  handleNativeBack,
  nativeHistoryDepth,
  nativeHistoryState,
} from "./nativeNavigation";
import { nativeRouteFromAppUrl } from "./routeContract";

type InsetsPlugin = {
  getInsets(): Promise<NativeInsets>;
  addListener(
    eventName: "insetsChange",
    listener: (insets: NativeInsets) => void,
  ): Promise<PluginListenerHandle>;
};

const NovaInsets = registerPlugin<InsetsPlugin>("NovaInsets");
const NovaShare = registerPlugin<{ shareProduct(options: { title: string }): Promise<void> }>("NovaShare");
const NovaPrint = registerPlugin<{ printCurrentDocument(): Promise<void> }>("NovaPrint");

function finiteInset(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeInsets(value: Partial<NativeInsets>): NativeInsets {
  return {
    top: finiteInset(value.top, DEFAULT_NATIVE_INSETS.top),
    right: finiteInset(value.right),
    bottom: finiteInset(value.bottom, DEFAULT_NATIVE_INSETS.bottom),
    left: finiteInset(value.left),
    ime: finiteInset(value.ime),
  };
}

function browserPreviewInsets(): NativeInsets {
  const query = new URLSearchParams(window.location.search);
  return normalizeInsets({
    top: Number(query.get("safeTop") ?? DEFAULT_NATIVE_INSETS.top),
    right: Number(query.get("safeRight") ?? 0),
    bottom: Number(query.get("safeBottom") ?? DEFAULT_NATIVE_INSETS.bottom),
    left: Number(query.get("safeLeft") ?? 0),
    ime: 0,
  });
}

function dismissTransientSurface() {
  const viewerClose = document.querySelector<HTMLButtonElement>(
    '.pdp-image-viewer[role="dialog"] button[aria-label="Görsel görüntüleyiciyi kapat"]',
  );
  if (viewerClose) {
    viewerClose.click();
    return true;
  }

  const openSheet = document.querySelector<HTMLElement>('[data-testid="bottom-sheet"][data-state="open"]');
  if (openSheet) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  }

  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    active.blur();
    return true;
  }

  return false;
}

export default function NativeRuntime({ children }: PropsWithChildren) {
  const native = Capacitor.isNativePlatform();
  const [insets, setInsets] = useState<NativeInsets>(() => browserPreviewInsets());

  useEffect(() => {
    document.documentElement.dataset.novastoreRuntime = "native";
    document.documentElement.dataset.novastorePlatform = native ? Capacitor.getPlatform() : "browser-proof";
    document.documentElement.lang = "tr";

    if (!native) return;

    let active = true;
    let insetsHandle: PluginListenerHandle | undefined;
    let backHandle: PluginListenerHandle | undefined;
    let urlHandle: PluginListenerHandle | undefined;
    let stateHandle: PluginListenerHandle | undefined;
    let hasAcceptedExternalRoute = false;

    const markPlatformAction = (name: string, promise: Promise<unknown>) => {
      document.documentElement.dataset.novastorePlatformAction = `${name}:pending`;
      void promise.then(() => {
        document.documentElement.dataset.novastorePlatformAction = `${name}:ready`;
      }).catch(() => {
        document.documentElement.dataset.novastorePlatformAction = `${name}:blocked`;
      });
    };
    const onShareProduct = (event: Event) => {
      const title = (event as CustomEvent<{ title?: unknown }>).detail?.title;
      if (typeof title !== "string") return;
      markPlatformAction("share", NovaShare.shareProduct({ title }));
    };
    const onPrintInvoice = () => {
      markPlatformAction("print", NovaPrint.printCurrentDocument());
    };

    window.addEventListener("novastore:share-product", onShareProduct);
    window.addEventListener("novastore:print-invoice", onPrintInvoice);

    if (nativeHistoryDepth(window.history.state) === 0) {
      window.history.replaceState(nativeHistoryState(window.history.state, 0), "", window.location.href);
    }

    const applyAppUrl = (url: string, replace: boolean) => {
      const route = nativeRouteFromAppUrl(url);
      if (!route) return false;
      const next = `${window.location.pathname}?${route.toString()}`;
      const currentParams = new URLSearchParams(window.location.search);
      const replaceInitialShell = !hasAcceptedExternalRoute
        && nativeHistoryDepth(window.history.state) === 0
        && !currentParams.has("shell");
      const shouldReplace = replace || replaceInitialShell;
      hasAcceptedExternalRoute = true;
      if (`${window.location.pathname}${window.location.search}` === next) {
        if (shouldReplace && nativeHistoryDepth(window.history.state) !== 0) {
          window.history.replaceState(nativeHistoryState(window.history.state, 0), "", next);
        }
        return true;
      }
      const depth = shouldReplace ? 0 : nativeHistoryDepth(window.history.state) + 1;
      const state = nativeHistoryState(window.history.state, depth);
      if (shouldReplace) window.history.replaceState(state, "", next);
      else window.history.pushState(state, "", next);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return true;
    };

    void NovaInsets.getInsets()
      .then((next) => {
        if (active) setInsets(normalizeInsets(next));
      })
      .catch(() => {
        document.documentElement.dataset.novastoreInsets = "blocked";
      });

    void NovaInsets.addListener("insetsChange", (next) => {
      if (active) setInsets(normalizeInsets(next));
    }).then((handle) => {
      insetsHandle = handle;
    });

    void App.addListener("backButton", () => {
      document.documentElement.dataset.novastoreBackAction = handleNativeBack({
        dismissTransientSurface,
        historyState: window.history.state,
        historyBack: () => window.history.back(),
        minimizeApp: () => App.minimizeApp(),
      });
    }).then((handle) => {
      backHandle = handle;
    });

    void App.addListener("appUrlOpen", ({ url }) => {
      applyAppUrl(url, false);
    }).then((handle) => {
      urlHandle = handle;
    });

    void App.getLaunchUrl()
      .then((launch) => {
        if (active && launch?.url) applyAppUrl(launch.url, true);
      })
      .catch(() => {
        document.documentElement.dataset.novastoreLaunchUrl = "blocked";
      });

    void App.addListener("appStateChange", ({ isActive }) => {
      document.documentElement.dataset.novastoreAppActive = isActive ? "true" : "false";
    }).then((handle) => {
      stateHandle = handle;
    });

    return () => {
      active = false;
      void insetsHandle?.remove();
      void backHandle?.remove();
      void urlHandle?.remove();
      void stateHandle?.remove();
      window.removeEventListener("novastore:share-product", onShareProduct);
      window.removeEventListener("novastore:print-invoice", onPrintInvoice);
    };
  }, [native]);

  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--novastore-safe-top", `${insets.top}px`);
    style.setProperty("--novastore-safe-right", `${insets.right}px`);
    style.setProperty("--novastore-safe-bottom", `${insets.bottom}px`);
    style.setProperty("--novastore-safe-left", `${insets.left}px`);
    style.setProperty("--novastore-ime-height", `${insets.ime}px`);
    document.documentElement.dataset.novastoreInsets = "ready";
  }, [insets]);

  const value = useMemo(() => insets, [insets]);

  return (
    <NativeRuntimeContext.Provider value={value}>
      <NativeKeyboardProvider>
        <div
          className="native-mobile-runtime"
          data-testid="native-mobile-runtime"
          data-runtime={native ? "capacitor" : "browser-proof"}
        >
          <div className="native-mobile-screen" data-testid="native-mobile-screen">
            <div className="native-mobile-viewport">{children}</div>
          </div>
        </div>
      </NativeKeyboardProvider>
    </NativeRuntimeContext.Provider>
  );
}
