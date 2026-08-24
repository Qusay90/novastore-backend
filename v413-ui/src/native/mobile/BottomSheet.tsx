import { type PropsWithChildren, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDrag } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";
import { useNativeInsets } from "../NativeRuntimeContext";
import { useKeyboard, useKeyboardInsets } from "./Keyboard";

type BottomSheetProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  snap?: number;
}>;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  snap = 0.72,
  children,
}: BottomSheetProps) {
  const keyboard = useKeyboard();
  const { keyboardHeight } = useKeyboardInsets();
  const insets = useNativeInsets();
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (open) keyboard.hide();
  }, [keyboard, open]);

  const bindDrag = useDrag(
    (state) => {
      const movementY = state.movement[1];
      const nextY = Math.max(0, movementY);
      if (!state.last) {
        setDragY(nextY);
        return;
      }
      const shouldClose = nextY > 96 || (state.velocity[1] > 0.55 && state.direction[1] > 0);
      setDragY(0);
      if (shouldClose) onOpenChange(false);
    },
    { axis: "y", filterTaps: true },
  );

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const sheetHeight = Math.round(viewportHeight * snap);
  const effectiveHeight = Math.max(260, sheetHeight - Math.min(keyboardHeight, 180));
  const bottom = Math.max(insets.bottom, keyboardHeight);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) keyboard.hide();
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  className="sheet-overlay"
                  data-testid="sheet-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  className="bottom-sheet"
                  data-testid="bottom-sheet"
                  style={{ bottom, maxHeight: effectiveHeight }}
                  initial={{ y: effectiveHeight + 36 }}
                  animate={{ y: dragY }}
                  exit={{ y: effectiveHeight + 36 }}
                  transition={{ type: "spring", stiffness: 500, damping: 43, mass: 0.9 }}
                >
                  <div className="sheet-handle-zone" data-testid="sheet-handle" {...bindDrag()}>
                    <div className="sheet-handle" />
                  </div>
                  <div className="sheet-header">
                    <Dialog.Title className="sheet-title">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="sheet-description">{description}</Dialog.Description>
                    ) : null}
                  </div>
                  <div className="sheet-content">{children}</div>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
