import React from "react";
import ReactDOM from "react-dom/client";
import NativeRuntime from "./native/NativeRuntime";
import { CustomerAccountRuntime } from "./account";
import { initializeCustomerSession } from "./auth/customerSession";
import { CustomerNotificationRuntime } from "./notifications";
import Prototype from "./Prototype";
import "./native/native-base.css";
import "./prototype.css";
import "./native/native.css";

document.documentElement.dataset.novastoreRuntime = "native";
const SESSION_BOOTSTRAP_TIMEOUT_MS = 5_000;

async function initializeCustomerSessionBounded() {
  let timeoutId: number | null = null;
  const initialization = initializeCustomerSession();
  try {
    await Promise.race([
      initialization,
      new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(
          () => reject(new Error("CUSTOMER_SESSION_BOOTSTRAP_TIMEOUT")),
          SESSION_BOOTSTRAP_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_SESSION_BOOTSTRAP_TIMEOUT") {
      // The native bridge cannot be cancelled. Observe a late successful load
      // and force the already-rendered guest runtimes through normal /me
      // bootstrap instead of leaving a hidden live credential generation.
      void initialization.then(() => {
        document.documentElement.dataset.novastoreSessionStorage = "ready-after-timeout";
        globalThis.dispatchEvent(new Event("novastore:session-ready"));
      }).catch(() => { /* fail-closed guest state remains authoritative */ });
    }
    throw error;
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
  }
}

async function bootstrapNativeCustomer() {
  try {
    await initializeCustomerSessionBounded();
  } catch {
    document.documentElement.dataset.novastoreSessionStorage = "unavailable";
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <NativeRuntime>
        <CustomerNotificationRuntime>
          <CustomerAccountRuntime>
            <Prototype />
          </CustomerAccountRuntime>
        </CustomerNotificationRuntime>
      </NativeRuntime>
    </React.StrictMode>,
  );
}

void bootstrapNativeCustomer();
