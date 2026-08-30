import React from "react";
import ReactDOM from "react-dom/client";
import { CustomerAccountRuntime, useCustomerAccountRuntime } from "../src/account";
import { initializeCustomerSession } from "../src/auth/customerSession";
import { CustomerNotificationRuntime, useCustomerNotificationRuntime } from "../src/notifications";

function RuntimeProbe() {
  const account = useCustomerAccountRuntime();
  const notifications = useCustomerNotificationRuntime();
  const [loginAResult, setLoginAResult] = React.useState("idle");
  const [loginBResult, setLoginBResult] = React.useState("idle");
  if (!account || !notifications) return null;

  const login = (customer: "a" | "b") => {
    const setResult = customer === "a" ? setLoginAResult : setLoginBResult;
    setResult("pending");
    void account.login(`customer-${customer}@example.test`, "customer-password")
      .then(() => setResult("success"))
      .catch(() => setResult("error"));
  };

  return (
    <main
      data-testid="runtime-probe"
      data-account-phase={account.phase}
      data-notification-phase={notifications.phase}
      data-session-available={String(notifications.sessionAvailable)}
    >
      <span data-testid="customer-id">{account.user?.id ?? "guest"}</span>
      <span data-testid="address-count">{account.addresses.length}</span>
      <span data-testid="order-count">{account.orders.length}</span>
      <span data-testid="support-count">{account.supportMessages.length}</span>
      <span data-testid="notification-count">{notifications.items.length}</span>
      <div data-testid="notification-titles">{notifications.items.map((item) => <span key={item.id}>{item.title}</span>)}</div>
      <button type="button" onClick={() => void account.refresh()}>Hesabı doğrula</button>
      <button type="button" onClick={() => void account.logout()}>Çıkış yap</button>
      <button type="button" onClick={() => login("a")}>Customer A girişi</button>
      <button type="button" onClick={() => login("b")}>Customer B girişi</button>
      <span data-testid="login-a-result">{loginAResult}</span>
      <span data-testid="login-b-result">{loginBResult}</span>
    </main>
  );
}

async function bootstrapFixture() {
  await initializeCustomerSession();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <CustomerNotificationRuntime>
        <CustomerAccountRuntime>
          <RuntimeProbe />
        </CustomerAccountRuntime>
      </CustomerNotificationRuntime>
    </React.StrictMode>,
  );
}

void bootstrapFixture();
