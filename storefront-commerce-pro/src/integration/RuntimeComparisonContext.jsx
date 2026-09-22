import { createContext } from "react";

const unavailableComparison = Object.freeze({
  available: false,
  ids: new Set(),
  toggle: () => {},
});

export const RuntimeComparisonContext = createContext(unavailableComparison);
