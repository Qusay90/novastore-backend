const finiteMetric = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const getAssistantViewportMetrics = (visualViewport, fallbackHeight) => Object.freeze({
  height: Math.max(1, Math.round(finiteMetric(visualViewport?.height, fallbackHeight))),
  top: Math.max(0, Math.round(finiteMetric(visualViewport?.offsetTop, 0))),
});

export const nextModeOptionIndex = (currentIndex, optionCount, key) => {
  if (!Number.isInteger(optionCount) || optionCount <= 0) return null;
  const current = Number.isInteger(currentIndex)
    ? Math.min(optionCount - 1, Math.max(0, currentIndex))
    : 0;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (key === "ArrowDown") return (current + 1) % optionCount;
  if (key === "ArrowUp") return (current - 1 + optionCount) % optionCount;
  return null;
};
