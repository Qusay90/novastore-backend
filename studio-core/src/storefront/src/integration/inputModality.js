const POINTER_MODALITY = "pointer";
const KEYBOARD_MODALITY = "keyboard";

export function installInputModalityTracking({
  documentRoot = globalThis.document,
} = {}) {
  const element = documentRoot?.documentElement;
  if (!element || typeof documentRoot.addEventListener !== "function") return () => {};

  const setPointer = () => {
    element.dataset.inputModality = POINTER_MODALITY;
  };
  const setKeyboard = (event) => {
    if (event.key === "Tab") element.dataset.inputModality = KEYBOARD_MODALITY;
  };

  documentRoot.addEventListener("pointerdown", setPointer, true);
  documentRoot.addEventListener("touchstart", setPointer, true);
  documentRoot.addEventListener("keydown", setKeyboard, true);

  return () => {
    documentRoot.removeEventListener("pointerdown", setPointer, true);
    documentRoot.removeEventListener("touchstart", setPointer, true);
    documentRoot.removeEventListener("keydown", setKeyboard, true);
    delete element.dataset.inputModality;
  };
}

export const inputModalityValues = Object.freeze({
  keyboard: KEYBOARD_MODALITY,
  pointer: POINTER_MODALITY,
});
