import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ensureNovaBotComposerVisible,
  GlobalNovaBotLauncher,
  requestNovaBotPresentation,
  useNovaBotBoundaryScrollChain,
} from "../src/assistant/novabotPresentation";
import "../src/prototype.css";

function Fixture() {
  const [openCount, setOpenCount] = useState(0);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  useNovaBotBoundaryScrollChain(messagesRef);
  return <div className="cal-app" data-testid="calibration-app">
    <div className="fixed-app-header" style={{ height: 48 }} data-testid="fixture-topbar" />
    <div className="mobile-scroll" data-testid="fixture-outer-scroll" style={{ position: "absolute", inset: 0, overflowY: "auto" }}>
      <div style={{ minHeight: 1300, paddingTop: 180 }}>
        <div
          ref={messagesRef}
          className="messages"
          data-testid="fixture-messages"
          data-scroll-drag="ignore"
          style={{ height: 120, margin: "0 40px", overflowY: "auto" }}
        >
          {Array.from({ length: 24 }, (_, index) => <p style={{ height: 28, margin: 0 }} key={index}>Mesaj {index + 1}</p>)}
        </div>
        <button
          type="button"
          data-testid="fixture-recovery"
          data-novabot-avoid="true"
          style={{ display: "block", width: "100%", height: 52, marginTop: 220 }}
          onClick={() => requestNovaBotPresentation("reset")}
        >NovaBot’u göster ve sıfırla</button>
        <form ref={composerRef} data-testid="fixture-composer" style={{ height: 56, margin: "470px 12px 0" }}>
          <input aria-label="Fixture NovaBot mesajı" />
        </form>
      </div>
    </div>
    <div className="bottom-nav" data-testid="fixture-bottom-nav" />
    <button type="button" data-testid="fixture-reveal-composer" style={{ position: "absolute", zIndex: 50, left: 0, top: 0 }} onClick={() => ensureNovaBotComposerVisible(composerRef.current)}>Composer’ı göster</button>
    <GlobalNovaBotLauncher
      assetSrc="/calibration-assets/official/support_novastore.png"
      routeKey="fixture:home"
      onOpen={() => setOpenCount((current) => current + 1)}
    />
    <output data-testid="fixture-open-count">{openCount}</output>
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Fixture />);
