import { createContext, useContext } from "react";

export type NativeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  ime: number;
};

export const DEFAULT_NATIVE_INSETS: NativeInsets = {
  top: 24,
  right: 0,
  bottom: 24,
  left: 0,
  ime: 0,
};

export const NativeRuntimeContext = createContext<NativeInsets>(DEFAULT_NATIVE_INSETS);

export function useNativeInsets() {
  return useContext(NativeRuntimeContext);
}
