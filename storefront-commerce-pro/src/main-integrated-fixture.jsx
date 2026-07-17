import React from "react";
import { createRoot } from "react-dom/client";
import { CommerceProRuntimeApp } from "./IntegratedApp.jsx";
import { createCanonicalFixtureRuntime } from "./integration/createCanonicalFixtureRuntime.js";
import "./canonical.css";
import "./integrated.css";

const runtime = createCanonicalFixtureRuntime();

createRoot(document.getElementById("root")).render(
  <React.StrictMode><CommerceProRuntimeApp runtime={runtime} /></React.StrictMode>,
);
