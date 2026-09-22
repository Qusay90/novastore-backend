import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  assistantModePresentationTestUtils,
  getAssistantModePresentation,
} from "../src/integration/assistantModePresentation.js";
import {
  createAssistantAdapter,
  normalizeAssistantCapability,
} from "../src/adapters/assistantAdapter.js";

const CANONICAL_SERVER_MODES = Object.freeze([
  ["professional", "Profesyonel Mod"],
  ["friendly", "Samimi Mod"],
  ["buddy", "Kanka Modu"],
  ["funny", "Komik Mod"],
  ["witty", "Alaycı Ama Saygılı Mod"],
  ["quick", "Hızlı Mod"],
  ["detailed", "Detaycı Mod"],
  ["technical", "Teknik Uzman Modu"],
  ["sales", "Satış Danışmanı Modu"],
].map(([id, label]) => ({ id, label, description: `${label} sunucu açıklaması` })));

test("R7 provider hazır değilken tıklanabilir görünen sahte mod seçicisi üretmez", () => {
  const capability = normalizeAssistantCapability({
    contractVersion: "novabot-modes-v1",
    available: true,
    provider: { configured: false, ready: false },
    advancedModesAvailable: false,
    modeSelectionAvailable: false,
    defaultModeId: "friendly",
    modes: [CANONICAL_SERVER_MODES[1]],
    unavailableReason: "ADVANCED_PROVIDER_NOT_CONFIGURED",
  });
  const presentation = getAssistantModePresentation({ phase: "ready", value: capability }, capability.modes[0]);

  assert.deepEqual(presentation, {
    kind: "status",
    label: "Samimi Mod",
    detail: assistantModePresentationTestUtils.UNAVAILABLE_REASON_COPY.ADVANCED_PROVIDER_NOT_CONFIGURED,
  });
});

test("R7 capability hata ve bilinmeyen unavailable reason durumları dürüst fallback üretir", () => {
  assert.deepEqual(getAssistantModePresentation({ phase: "error", value: null }, null), {
    kind: "status",
    label: "Temel sohbet",
    detail: "Mod bilgisi alınamadı. Temel sohbeti yeniden deneyebilirsiniz.",
  });
  assert.equal(
    getAssistantModePresentation({ phase: "ready", value: { contractVersion: "novabot-modes-v1", modes: [], unavailableReason: "FUTURE_REASON" } }, null).detail,
    assistantModePresentationTestUtils.FALLBACK_UNAVAILABLE_COPY,
  );
});

test("R7 yalnız doğrulanmış novabot-modes-v1 ve server-ready capability ile seçiciyi açar", () => {
  const contradictory = {
    contractVersion: "novabot-modes-v1",
    provider: { configured: false, ready: false },
    advancedModesAvailable: true,
    modeSelectionAvailable: true,
    modes: CANONICAL_SERVER_MODES,
  };
  assert.equal(getAssistantModePresentation({ phase: "ready", value: contradictory }, CANONICAL_SERVER_MODES[1]).kind, "status");
  assert.deepEqual(
    getAssistantModePresentation({ phase: "ready", value: { ...contradictory, contractVersion: "future-contract" } }, null),
    { kind: "status", label: "Temel sohbet", detail: assistantModePresentationTestUtils.UNSUPPORTED_CONTRACT_COPY },
  );
});

test("R7 provider hazır olduğunda server-owned dokuz mod seçilebilir ve her modeId top-level gönderilir", async () => {
  const calls = [];
  const http = {
    async request(path, options = {}) {
      calls.push({ path, options });
      if (path === "/api/assistant/capability") return {
        contractVersion: "novabot-modes-v1",
        available: true,
        provider: { configured: true, ready: true },
        advancedModesAvailable: true,
        modeSelectionAvailable: true,
        defaultModeId: "friendly",
        modes: CANONICAL_SERVER_MODES,
        unavailableReason: null,
      };
      return { reply: "Yerel doğrulama yanıtı", modeId: options.body.modeId };
    },
  };
  const assistant = createAssistantAdapter({ http, getProduct: () => null });
  const capability = await assistant.getCapability();

  assert.equal(getAssistantModePresentation({ phase: "ready", value: capability }, capability.modes[1]).kind, "selector");
  assert.equal(capability.modes.length, 9);
  for (const mode of capability.modes) {
    const response = await assistant.chat({ message: "Mod sözleşmesini doğrula", modeId: mode.id });
    assert.equal(response.mode, mode.id);
  }
  assert.deepEqual(calls.slice(1).map((call) => call.options.body.modeId), CANONICAL_SERVER_MODES.map((mode) => mode.id));
});

test("R7 Customer Web mod kimliklerini tanımlamaz ve server contract seçeneklerini render eder", async () => {
  const [widgetSource, presentationSource] = await Promise.all([
    fs.readFile(new URL("../src/AssistantWidget.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/integration/assistantModePresentation.js", import.meta.url), "utf8"),
  ]);

  assert.match(widgetSource, /modePresentation\.kind === "selector"/u);
  assert.match(widgetSource, /capabilityModes\.map\(\(option, index\) =>/u);
  assert.match(widgetSource, /role="listbox" aria-label="NovaBot sohbet modları"/u);
  assert.match(widgetSource, /role="option" aria-selected=/u);
  assert.doesNotMatch(widgetSource, /<select\b/u);
  assert.match(widgetSource, /assistant\.chat\(\{ message: text, history, modeId: selectedServerModeId \}\)/u);
  assert.match(widgetSource, /role="status" aria-label=\{`NovaBot sohbet modu:/u);
  assert.doesNotMatch(widgetSource, /const\s+CANONICAL_SERVER_MODES/u);
  assert.doesNotMatch(presentationSource, /\bprofessional\b|\bbuddy\b|\btechnical\b|\bsales\b/u);
});
