import React from "react";
import ReactDOM from "react-dom/client";
import Prototype from "../src/Prototype";
import { CustomerNotificationRuntime } from "../src/notifications";
import { MobileRuntime } from "../src/mobile";
import "../src/styles.css";
import "../src/prototype.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MobileRuntime><CustomerNotificationRuntime><Prototype /></CustomerNotificationRuntime></MobileRuntime>
  </React.StrictMode>,
);
