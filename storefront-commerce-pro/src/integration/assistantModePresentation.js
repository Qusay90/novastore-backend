const UNAVAILABLE_REASON_COPY = Object.freeze({
  ADVANCED_PROVIDER_NOT_SELECTED: "Gelişmiş modlar için yapay zekâ sağlayıcısı seçilmedi. Temel sohbet açık.",
  ADVANCED_PROVIDER_NOT_CONFIGURED: "Gelişmiş modların sağlayıcı yapılandırması tamamlanmadı. Temel sohbet açık.",
  EXTERNAL_AI_DISABLED: "Gelişmiş modlar bu ortamda kapalı. Temel sohbet açık.",
});

const FALLBACK_UNAVAILABLE_COPY = "Gelişmiş modlar şu anda kullanılamıyor. Temel sohbet açık.";
const UNSUPPORTED_CONTRACT_COPY = "Mod sözleşmesi doğrulanamadı. Temel sohbeti yeniden deneyebilirsiniz.";

export const getAssistantModePresentation = (capabilityState, selectedMode) => {
  if (capabilityState?.phase === "loading") {
    return Object.freeze({ kind: "status", label: "Modlar yükleniyor…", detail: "" });
  }

  if (capabilityState?.phase !== "ready") {
    return Object.freeze({
      kind: "status",
      label: "Temel sohbet",
      detail: "Mod bilgisi alınamadı. Temel sohbeti yeniden deneyebilirsiniz.",
    });
  }

  const capability = capabilityState.value;
  if (capability?.contractVersion !== "novabot-modes-v1") {
    return Object.freeze({ kind: "status", label: "Temel sohbet", detail: UNSUPPORTED_CONTRACT_COPY });
  }

  const modes = Array.isArray(capability?.modes) ? capability.modes : [];
  if (
    capability?.provider?.ready === true
    && capability?.advancedModesAvailable === true
    && capability?.modeSelectionAvailable === true
    && modes.length > 1
  ) {
    return Object.freeze({ kind: "selector", label: "Sohbet modu", detail: "" });
  }

  const fallbackMode = selectedMode || modes.find((option) => option.id === capability?.defaultModeId) || modes[0];
  return Object.freeze({
    kind: "status",
    label: fallbackMode?.label || "Temel sohbet",
    detail: UNAVAILABLE_REASON_COPY[capability?.unavailableReason] || FALLBACK_UNAVAILABLE_COPY,
  });
};

export const assistantModePresentationTestUtils = Object.freeze({
  FALLBACK_UNAVAILABLE_COPY,
  UNSUPPORTED_CONTRACT_COPY,
  UNAVAILABLE_REASON_COPY,
});
