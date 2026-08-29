import React from "react";
import ReactDOM from "react-dom/client";
import Prototype from "../src/Prototype";
import { CustomerNotificationRuntime, markCustomerSessionVerified } from "../src/notifications";
import { MobileRuntime } from "../src/mobile";
import "../src/styles.css";
import "../src/prototype.css";

if (new URLSearchParams(window.location.search).get("verifiedFixture") === "1") {
  markCustomerSessionVerified({ id: 17, fullName: "Test Müşteri", email: "test@example.invalid", role: "customer" });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MobileRuntime><CustomerNotificationRuntime><Prototype /></CustomerNotificationRuntime></MobileRuntime>
  </React.StrictMode>,
);
