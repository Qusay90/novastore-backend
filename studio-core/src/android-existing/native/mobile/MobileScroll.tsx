import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
} from "react";
import { useKeyboardInsets } from "./Keyboard";

type MobileScrollProps = PropsWithChildren<{ className?: string }>;

const NATIVE_PULL_EVENT = "novastore:native-pull";
const NATIVE_PULL_DISTANCE = 56;
const NATIVE_CAROUSEL_DRAG_THRESHOLD = 8;
const NATIVE_CAROUSEL_HORIZONTAL_COMMIT_THRESHOLD = 24;
const NATIVE_CAROUSEL_AXIS_LOCK_RATIO = 1.35;

type NativePullSession = {
  active: boolean;
  fallback: boolean;
  startX: number;
  startY: number;
  progress: number;
};

type NativeCarouselDragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  captured: boolean;
  vertical: boolean;
};

export function MobileScroll({ className, children }: MobileScrollProps) {
  const { isKeyboardVisible, keyboardHeight } = useKeyboardInsets();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const carouselDragSession = useRef<NativeCarouselDragSession | null>(null);
  const suppressClickTimer = useRef<number | null>(null);
  const suppressNextClick = useRef(false);
  const pullSession = useRef<NativePullSession>({
    active: false,
    fallback: false,
    startX: 0,
    startY: 0,
    progress: 0,
  });
  const [thumb, setThumb] = useState({ visible: false, top: 0, height: 0 });

  const updateThumb = useCallback((visible: boolean) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const enabled = scroll.scrollHeight > scroll.clientHeight + 2;
    const height = enabled ? Math.max(36, (scroll.clientHeight / scroll.scrollHeight) * scroll.clientHeight) : 0;
    const track = Math.max(0, scroll.clientHeight - height - 8);
    const progress = scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight);
    setThumb({ visible: visible && enabled, top: enabled ? 4 + progress * track : 0, height });
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    if (visible && enabled) {
      hideTimer.current = window.setTimeout(() => {
        setThumb((current) => ({ ...current, visible: false }));
      }, 650);
    }
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const onScroll = () => updateThumb(true);
    const observer = new ResizeObserver(() => updateThumb(false));
    scroll.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(scroll);
    if (scroll.firstElementChild) observer.observe(scroll.firstElementChild);
    updateThumb(false);
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, [updateThumb]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const publish = (phase: "move" | "release" | "cancel", progress: number, fallback: boolean) => {
      window.dispatchEvent(new CustomEvent(NATIVE_PULL_EVENT, {
        detail: { phase, progress, fallback },
      }));
    };
    const reset = () => {
      pullSession.current = {
        active: false,
        fallback: false,
        startX: 0,
        startY: 0,
        progress: 0,
      };
      scroll.dataset.overscroll = "0.00";
    };
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = event.target;
      const ignored = target instanceof Element && Boolean(target.closest(
        "input, textarea, select, [contenteditable='true'], [data-scroll-drag='ignore']",
      ));
      if (!touch || event.touches.length !== 1 || ignored || scroll.scrollTop > 1) {
        reset();
        return;
      }
      pullSession.current = {
        active: true,
        fallback: scroll.scrollHeight <= scroll.clientHeight + 2,
        startX: touch.clientX,
        startY: touch.clientY,
        progress: 0,
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      const current = pullSession.current;
      const touch = event.touches[0];
      if (!current.active || !touch || scroll.scrollTop > 1) return;
      const deltaX = touch.clientX - current.startX;
      const deltaY = touch.clientY - current.startY;
      if (Math.abs(deltaX) > Math.abs(deltaY) + 6 || deltaY < -8) {
        publish("cancel", 0, current.fallback);
        reset();
        return;
      }
      if (deltaY <= 4) return;
      event.preventDefault();
      const pullDistance = (deltaY - 4) * 0.5;
      current.progress = Math.min(1, pullDistance / NATIVE_PULL_DISTANCE);
      scroll.dataset.overscroll = pullDistance.toFixed(2);
      publish("move", current.progress, current.fallback);
    };
    const finish = (canceled: boolean) => {
      const current = pullSession.current;
      if (!current.active) return;
      publish(canceled ? "cancel" : "release", current.progress, current.fallback);
      reset();
    };
    const onTouchEnd = () => finish(false);
    // Android WebView can promote a prevented vertical pull to a canceled
    // browser touch sequence even though the user's finger was released
    // normally. Once the refresh threshold is armed, preserve that release;
    // sub-threshold/system-canceled gestures still fail closed.
    const onTouchCancel = () => finish(pullSession.current.progress < 1);

    scroll.addEventListener("touchstart", onTouchStart, { passive: true });
    scroll.addEventListener("touchmove", onTouchMove, { passive: false });
    scroll.addEventListener("touchend", onTouchEnd, { passive: true });
    scroll.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      scroll.removeEventListener("touchstart", onTouchStart);
      scroll.removeEventListener("touchmove", onTouchMove);
      scroll.removeEventListener("touchend", onTouchEnd);
      scroll.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  useEffect(() => () => {
    if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current);
  }, []);

  const finishCarouselDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const scroll = scrollRef.current;
    const session = carouselDragSession.current;
    if (!scroll || !session || session.pointerId !== event.pointerId) return;

    if (session.captured && scroll.hasPointerCapture(event.pointerId)) {
      scroll.releasePointerCapture(event.pointerId);
    }
    scroll.dataset.dragging = "false";
    carouselDragSession.current = null;

    if (session.vertical) {
      if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current);
      suppressClickTimer.current = window.setTimeout(() => {
        suppressNextClick.current = false;
        suppressClickTimer.current = null;
      }, 500);
    }
  }, []);

  const onCarouselPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const scroll = scrollRef.current;
    const target = event.target;
    if (
      !scroll ||
      event.pointerType === "mouse" ||
      !(target instanceof Element) ||
      !target.closest(".mobile-carousel") ||
      target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      carouselDragSession.current = null;
      return;
    }

    carouselDragSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollTop: scroll.scrollTop,
      captured: false,
      vertical: false,
    };
  }, []);

  const onCarouselPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const scroll = scrollRef.current;
    const session = carouselDragSession.current;
    if (!scroll || !session || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (!session.vertical) {
      if (Math.max(horizontalDistance, verticalDistance) < NATIVE_CAROUSEL_DRAG_THRESHOLD) return;

      const horizontalIntent = (
        horizontalDistance >= NATIVE_CAROUSEL_HORIZONTAL_COMMIT_THRESHOLD &&
        horizontalDistance >= verticalDistance * NATIVE_CAROUSEL_AXIS_LOCK_RATIO
      );
      if (horizontalIntent) {
        carouselDragSession.current = null;
        return;
      }

      const verticalIntent = (
        verticalDistance >= NATIVE_CAROUSEL_DRAG_THRESHOLD &&
        verticalDistance >= horizontalDistance
      );
      if (!verticalIntent) return;

      // A downward drag at the top belongs to the native pull-to-refresh
      // listener above. Every other vertical drag that began on a carousel is
      // handled here because the carousel's touch-action:none deliberately
      // disables WebView's irreversible first-move axis lock.
      if (session.startScrollTop <= 1 && deltaY > 0) {
        carouselDragSession.current = null;
        return;
      }

      try {
        scroll.setPointerCapture(event.pointerId);
        session.captured = true;
      } catch {
        // Android can cancel a system-owned pointer before capture completes.
      }
      session.vertical = true;
      suppressNextClick.current = true;
      scroll.dataset.dragging = "true";
    }

    event.preventDefault();
    const maximum = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = Math.max(0, Math.min(maximum, session.startScrollTop - deltaY));
  }, []);

  const suppressCarouselClickAfterDrag = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressNextClick.current) return;
    suppressNextClick.current = false;
    if (suppressClickTimer.current !== null) {
      window.clearTimeout(suppressClickTimer.current);
      suppressClickTimer.current = null;
    }
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <section
      className={`mobile-page ${className ?? ""}`}
      data-keyboard-dragging="false"
      data-keyboard-visible={isKeyboardVisible ? "true" : "false"}
      style={{ "--keyboard-height": `${keyboardHeight}px` } as CSSProperties}
    >
      <div
        ref={scrollRef}
        className="mobile-scroll"
        data-testid="mobile-scroll"
        data-dragging="false"
        data-overscroll="0.00"
        onPointerDown={onCarouselPointerDown}
        onPointerMove={onCarouselPointerMove}
        onPointerUp={finishCarouselDrag}
        onPointerCancel={finishCarouselDrag}
        onClickCapture={suppressCarouselClickAfterDrag}
      >
        <div className="mobile-scroll-content" data-testid="mobile-scroll-content">
          {children}
        </div>
      </div>
      <div
        className="mobile-scrollbar"
        data-testid="mobile-scrollbar"
        data-visible={thumb.visible ? "true" : "false"}
        aria-hidden="true"
      >
        <div
          className="mobile-scrollbar-thumb"
          style={{ height: thumb.height, transform: `translateY(${thumb.top}px)` }}
        />
      </div>
    </section>
  );
}
