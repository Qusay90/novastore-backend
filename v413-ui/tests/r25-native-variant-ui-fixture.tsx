import React from "react";
import ReactDOM from "react-dom/client";
import { CustomerAccountRuntime } from "../src/account";
import { initializeCustomerSession } from "../src/auth/customerSession";
import { MobileRuntime } from "../src/mobile";
import { CustomerNotificationRuntime } from "../src/notifications";
import Prototype from "../src/Prototype";
import "../src/styles.css";
import "../src/prototype.css";

async function bootstrap() {
  await initializeCustomerSession();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <CustomerNotificationRuntime>
        <CustomerAccountRuntime>
          <MobileRuntime>
            <Prototype />
          </MobileRuntime>
        </CustomerAccountRuntime>
      </CustomerNotificationRuntime>
    </React.StrictMode>,
  );
}

void bootstrap();
