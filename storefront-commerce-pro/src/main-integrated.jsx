import React from "react";
import { createRoot } from "react-dom/client";
import { IntegratedApp } from "./IntegratedApp.jsx";
import "./canonical.css";
import "./integrated.css";

globalThis.__NOVASTORE_INTEGRATED_RUNTIME_OWNS_CART_HYDRATION__ = true;

createRoot(document.getElementById("root")).render(
  <React.StrictMode><IntegratedApp /></React.StrictMode>,
);
