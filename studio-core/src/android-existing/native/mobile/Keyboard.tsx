import {
  createContext,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type Ref,
  type TextareaHTMLAttributes,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNativeInsets } from "../NativeRuntimeContext";

type NativeKeyboardContextValue = {
  visible: boolean;
  height: number;
  fullHeight: number;
  progress: number;
  dragOffset: number;
  isDragging: boolean;
  focusedElement: HTMLElement | null;
  setDragOffset: (offset: number) => void;
  setDragging: (dragging: boolean) => void;
  show: (element?: HTMLElement | null) => void;
  hide: () => void;
};

type KeyboardInputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

const NativeKeyboardContext = createContext<NativeKeyboardContextValue | null>(null);

export function NativeKeyboardProvider({ children }: PropsWithChildren) {
  const insets = useNativeInsets();
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null);
  const [viewportKeyboard, setViewportKeyboard] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setViewportKeyboard(covered > 80 ? covered : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        setFocusedElement(event.target);
      }
    };
    const onFocusOut = () => window.setTimeout(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) {
        setFocusedElement(null);
      }
    }, 0);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const height = Math.max(insets.ime, viewportKeyboard);
  const visible = Boolean(focusedElement) && height > 0;
  const value = useMemo<NativeKeyboardContextValue>(() => ({
    visible,
    height,
    fullHeight: height,
    progress: visible ? 1 : 0,
    dragOffset: 0,
    isDragging: false,
    focusedElement,
    setDragOffset: () => undefined,
    setDragging: () => undefined,
    show: (element) => setFocusedElement(element ?? null),
    hide: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      setFocusedElement(null);
    },
  }), [focusedElement, height, visible]);

  return <NativeKeyboardContext.Provider value={value}>{children}</NativeKeyboardContext.Provider>;
}

export function useKeyboard() {
  const context = useContext(NativeKeyboardContext);
  if (!context) throw new Error("useKeyboard must be used inside NativeKeyboardProvider");
  return context;
}

export function useKeyboardInsets() {
  const keyboard = useKeyboard();
  const insets = useNativeInsets();
  return {
    keyboardHeight: keyboard.height,
    keyboardFullHeight: keyboard.fullHeight,
    keyboardDragging: false,
    bottomInset: keyboard.visible ? keyboard.height : insets.bottom,
    availableHeight: Math.max(0, window.innerHeight - keyboard.height),
    isKeyboardVisible: keyboard.visible,
  };
}

export function KeyboardInput(props: KeyboardInputProps) {
  const keyboard = useKeyboard();
  const { ref, ...inputProps } = props;
  return (
    <input
      {...inputProps}
      ref={ref}
      onFocus={(event) => {
        keyboard.show(event.currentTarget);
        inputProps.onFocus?.(event);
      }}
    />
  );
}

export function KeyboardTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const keyboard = useKeyboard();
  return (
    <textarea
      {...props}
      onFocus={(event) => {
        keyboard.show(event.currentTarget);
        props.onFocus?.(event);
      }}
    />
  );
}
