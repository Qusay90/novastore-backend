import React from "react";
import ReactDOM from "react-dom/client";
import NativeRuntime from "./native/NativeRuntime";
import Prototype from "./Prototype";
import "./native/native-base.css";
import "./prototype.css";
import "./native/native.css";

document.documentElement.dataset.novastoreRuntime = "native";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NativeRuntime>
      <Prototype />
    </NativeRuntime>
  </React.StrictMode>,
);
