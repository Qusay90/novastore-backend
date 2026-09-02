import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export type NovaBotEdge = "left" | "right";
export type NovaBotPresentationPreference = Readonly<{
  schemaVersion: 1;
  edge: NovaBotEdge;
  safeVerticalRatio: number;
  movable: boolean;
  hidden: boolean;
}>;
export type NovaBotPresentationCommand = "show" | "hide" | "fixed" | "movable" | "reset";

type Point = Readonly<{ x: number; y: number }>;
type SafeBounds = Readonly<{ width: number; height: number; minY: number; maxY: number }>;

export const NOVABOT_PRESENTATION_STORAGE_KEY = "novastore.novabot.presentation.v1";
export const NOVABOT_PRESENTATION_EVENT = "novastore:novabot-presentation";
export const NOVABOT_DRAG_THRESHOLD_PX = 8;

const GROUP_WIDTH = 56;
const GROUP_HEIGHT = 70;
const EDGE_GAP = 8;
const OBSTACLE_GAP = 8;
const DEFAULT_PREFERENCE: NovaBotPresentationPreference = Object.freeze({
  schemaVersion: 1,
  edge: "right",
  safeVerticalRatio: 0.62,
  movable: true,
  hidden: false,
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeNovaBotPresentationPreference(value: unknown): NovaBotPresentationPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PREFERENCE;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return DEFAULT_PREFERENCE;
  const edge = candidate.edge === "left" || candidate.edge === "right" ? candidate.edge : DEFAULT_PREFERENCE.edge;
  const safeVerticalRatio = typeof candidate.safeVerticalRatio === "number" && Number.isFinite(candidate.safeVerticalRatio)
    ? clamp(candidate.safeVerticalRatio, 0, 1)
    : DEFAULT_PREFERENCE.safeVerticalRatio;
  return Object.freeze({
    schemaVersion: 1,
    edge,
    safeVerticalRatio,
    movable: typeof candidate.movable === "boolean" ? candidate.movable : DEFAULT_PREFERENCE.movable,
    hidden: typeof candidate.hidden === "boolean" ? candidate.hidden : DEFAULT_PREFERENCE.hidden,
  });
}

export function loadNovaBotPresentationPreference(storage?: Pick<Storage, "getItem"> | null) {
  try {
    const resolvedStorage = storage === undefined
      ? (typeof window === "undefined" ? null : window.localStorage)
      : storage;
    if (!resolvedStorage) return DEFAULT_PREFERENCE;
    const raw = resolvedStorage.getItem(NOVABOT_PRESENTATION_STORAGE_KEY);
    return raw ? normalizeNovaBotPresentationPreference(JSON.parse(raw)) : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function storeNovaBotPresentationPreference(preference: NovaBotPresentationPreference) {
  try {
    window.localStorage.setItem(NOVABOT_PRESENTATION_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Presentation preference is optional; storage denial must not block NovaBot.
  }
}

export function requestNovaBotPresentation(command: NovaBotPresentationCommand) {
  window.dispatchEvent(new CustomEvent<NovaBotPresentationCommand>(NOVABOT_PRESENTATION_EVENT, { detail: command }));
}

export function resolveNovaBotEdge(releaseCenterX: number, viewportWidth: number): NovaBotEdge {
  return releaseCenterX < viewportWidth / 2 ? "left" : "right";
}

function positionFromPreference(preference: NovaBotPresentationPreference, bounds: SafeBounds): Point {
  const availableY = Math.max(0, bounds.maxY - bounds.minY);
  return {
    x: preference.edge === "left" ? EDGE_GAP : Math.max(EDGE_GAP, bounds.width - GROUP_WIDTH - EDGE_GAP),
    y: bounds.minY + availableY * preference.safeVerticalRatio,
  };
}

function safeBoundsFor(container: HTMLElement): SafeBounds {
  const containerRect = container.getBoundingClientRect();
  let minY = EDGE_GAP;
  let maxY = Math.max(EDGE_GAP, container.clientHeight - GROUP_HEIGHT - EDGE_GAP);

  for (const selector of [".fixed-app-header", ".pdp-topbar", ".cart-title", ".support-heading"]) {
    const obstacle = container.querySelector<HTMLElement>(selector);
    if (!obstacle) continue;
    const rect = obstacle.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
      minY = Math.max(minY, rect.bottom - containerRect.top + OBSTACLE_GAP);
    }
  }

  for (const selector of [".bottom-nav", ".pdp-footer", ".composer", ".real-support-composer", "[data-novabot-safe-bottom]"]) {
    const obstacle = container.querySelector<HTMLElement>(selector);
    if (!obstacle) continue;
    const rect = obstacle.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
      maxY = Math.min(maxY, rect.top - containerRect.top - GROUP_HEIGHT - OBSTACLE_GAP);
    }
  }

  maxY = Math.max(minY, maxY);
  return { width: container.clientWidth, height: container.clientHeight, minY, maxY };
}

function avoidMarkedControls(container: HTMLElement, requested: Point, bounds: SafeBounds): Point {
  const containerRect = container.getBoundingClientRect();
  const x = clamp(requested.x, EDGE_GAP, Math.max(EDGE_GAP, bounds.width - GROUP_WIDTH - EDGE_GAP));
  let y = clamp(requested.y, bounds.minY, bounds.maxY);
  const groupLeft = containerRect.left + x;
  const groupRight = groupLeft + GROUP_WIDTH;
  const obstacles = [...container.querySelectorAll<HTMLElement>("[data-novabot-avoid='true']")]
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.height > 0 && rect.right > groupLeft && rect.left < groupRight);

  for (let attempt = 0; attempt < obstacles.length + 1; attempt += 1) {
    const collision = obstacles.find((rect) => {
      const top = containerRect.top + y;
      return top < rect.bottom + OBSTACLE_GAP && top + GROUP_HEIGHT > rect.top - OBSTACLE_GAP;
    });
    if (!collision) break;
    const before = clamp(collision.top - containerRect.top - GROUP_HEIGHT - OBSTACLE_GAP, bounds.minY, bounds.maxY);
    const after = clamp(collision.bottom - containerRect.top + OBSTACLE_GAP, bounds.minY, bounds.maxY);
    y = Math.abs(before - y) <= Math.abs(after - y) ? before : after;
  }
  return { x, y };
}

export function resolveNovaBotBoundaryTransfer(input: Readonly<{
  fingerDeltaY: number;
  innerScrollTop: number;
  innerScrollHeight: number;
  innerClientHeight: number;
  parentScrollTop: number;
  parentScrollHeight: number;
  parentClientHeight: number;
}>) {
  const innerMaximum = Math.max(0, input.innerScrollHeight - input.innerClientHeight);
  const parentMaximum = Math.max(0, input.parentScrollHeight - input.parentClientHeight);
  const atInnerTop = input.innerScrollTop <= 1;
  const atInnerBottom = input.innerScrollTop >= innerMaximum - 1;
  const chainsUp = input.fingerDeltaY > 0 && atInnerTop;
  const chainsDown = input.fingerDeltaY < 0 && atInnerBottom;
  if (!chainsUp && !chainsDown) return input.parentScrollTop;
  return clamp(input.parentScrollTop - input.fingerDeltaY, 0, parentMaximum);
}

export function useNovaBotBoundaryScrollChain(innerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const inner = innerRef.current;
    const parent = inner?.closest<HTMLElement>(".mobile-scroll");
    if (!inner || !parent) return;
    let active = false;
    let lastY = 0;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      active = event.touches.length === 1 && Boolean(touch);
      if (touch) lastY = touch.clientY;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!active || event.touches.length !== 1 || !touch) return;
      const fingerDeltaY = touch.clientY - lastY;
      lastY = touch.clientY;
      const nextParentTop = resolveNovaBotBoundaryTransfer({
        fingerDeltaY,
        innerScrollTop: inner.scrollTop,
        innerScrollHeight: inner.scrollHeight,
        innerClientHeight: inner.clientHeight,
        parentScrollTop: parent.scrollTop,
        parentScrollHeight: parent.scrollHeight,
        parentClientHeight: parent.clientHeight,
      });
      if (Math.abs(nextParentTop - parent.scrollTop) < 0.5) return;
      event.preventDefault();
      parent.scrollTop = nextParentTop;
    };
    const onTouchEnd = () => { active = false; };
    const onWheel = (event: WheelEvent) => {
      const nextParentTop = resolveNovaBotBoundaryTransfer({
        fingerDeltaY: -event.deltaY,
        innerScrollTop: inner.scrollTop,
        innerScrollHeight: inner.scrollHeight,
        innerClientHeight: inner.clientHeight,
        parentScrollTop: parent.scrollTop,
        parentScrollHeight: parent.scrollHeight,
        parentClientHeight: parent.clientHeight,
      });
      if (Math.abs(nextParentTop - parent.scrollTop) < 0.5) return;
      event.preventDefault();
      parent.scrollTop = nextParentTop;
    };

    inner.addEventListener("touchstart", onTouchStart, { passive: true });
    inner.addEventListener("touchmove", onTouchMove, { passive: false });
    inner.addEventListener("touchend", onTouchEnd, { passive: true });
    inner.addEventListener("touchcancel", onTouchEnd, { passive: true });
    inner.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      inner.removeEventListener("touchstart", onTouchStart);
      inner.removeEventListener("touchmove", onTouchMove);
      inner.removeEventListener("touchend", onTouchEnd);
      inner.removeEventListener("touchcancel", onTouchEnd);
      inner.removeEventListener("wheel", onWheel);
    };
  }, [innerRef]);
}

export function ensureNovaBotComposerVisible(composer: HTMLElement | null) {
  const scroll = composer?.closest<HTMLElement>(".mobile-scroll");
  if (!composer || !scroll) return;
  const composerRect = composer.getBoundingClientRect();
  const scrollRect = scroll.getBoundingClientRect();
  const visualViewportBottom = window.visualViewport
    ? window.visualViewport.offsetTop + window.visualViewport.height
    : scrollRect.bottom;
  let lowerLimit = Math.min(scrollRect.bottom, visualViewportBottom) - 10;
  const app = scroll.closest<HTMLElement>(".cal-app");
  const mobilePage = scroll.closest<HTMLElement>(".mobile-page");
  if (mobilePage?.dataset.keyboardVisible === "true" && app) {
    const safeBottom = Number.parseFloat(getComputedStyle(app).getPropertyValue("--shell-safe-bottom"));
    if (Number.isFinite(safeBottom) && safeBottom > 0) lowerLimit -= safeBottom;
  }
  for (const selector of [".bottom-nav", ".pdp-footer", "[data-novabot-safe-bottom]"]) {
    const obstacle = app?.querySelector<HTMLElement>(selector);
    if (!obstacle) continue;
    const obstacleRect = obstacle.getBoundingClientRect();
    if (obstacleRect.height > 0 && obstacleRect.bottom > scrollRect.top && obstacleRect.top < scrollRect.bottom) {
      lowerLimit = Math.min(lowerLimit, obstacleRect.top - 10);
    }
  }
  const upperLimit = scrollRect.top + 10;
  if (composerRect.bottom > lowerLimit) scroll.scrollTop += composerRect.bottom - lowerLimit;
  else if (composerRect.top < upperLimit) scroll.scrollTop -= upperLimit - composerRect.top;
}

type GlobalNovaBotLauncherProps = Readonly<{
  assetSrc: string;
  routeKey: string;
  onOpen: () => void;
}>;

export function GlobalNovaBotLauncher({ assetSrc, routeKey, onOpen }: GlobalNovaBotLauncherProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });
  const suppressClick = useRef(false);
  const [preference, setPreference] = useState(loadNovaBotPresentationPreference);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const updatePreference = useCallback((update: (current: NovaBotPresentationPreference) => NovaBotPresentationPreference) => {
    setPreference((current) => {
      const next = normalizeNovaBotPresentationPreference(update(current));
      storeNovaBotPresentationPreference(next);
      return next;
    });
  }, []);

  const reconcilePosition = useCallback((nextPreference = preference) => {
    const host = hostRef.current;
    const container = host?.closest<HTMLElement>(".cal-app");
    if (!host || !container) return;
    const bounds = safeBoundsFor(container);
    setPosition(avoidMarkedControls(container, positionFromPreference(nextPreference, bounds), bounds));
    setReady(true);
  }, [preference]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => reconcilePosition());
    const container = hostRef.current?.closest<HTMLElement>(".cal-app");
    if (!container) return () => window.cancelAnimationFrame(frame);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => reconcilePosition()) : null;
    observer?.observe(container);
    const viewport = window.visualViewport;
    const onViewportResize = () => reconcilePosition();
    const scrollSurface = container.querySelector<HTMLElement>(".mobile-scroll");
    viewport?.addEventListener("resize", onViewportResize);
    scrollSurface?.addEventListener("scroll", onViewportResize, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      viewport?.removeEventListener("resize", onViewportResize);
      scrollSurface?.removeEventListener("scroll", onViewportResize);
    };
  }, [reconcilePosition, routeKey]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<unknown>).detail;
      if (!["show", "hide", "fixed", "movable", "reset"].includes(String(command))) return;
      setMenuOpen(false);
      if (command === "reset") updatePreference(() => DEFAULT_PREFERENCE);
      else if (command === "show") updatePreference((current) => ({ ...current, hidden: false }));
      else if (command === "hide") updatePreference((current) => ({ ...current, hidden: true }));
      else if (command === "fixed") updatePreference((current) => ({ ...current, movable: false }));
      else if (command === "movable") updatePreference((current) => ({ ...current, movable: true }));
    };
    window.addEventListener(NOVABOT_PRESENTATION_EVENT, onCommand);
    return () => window.removeEventListener(NOVABOT_PRESENTATION_EVENT, onCommand);
  }, [updatePreference]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>, canceled: boolean) => {
    const session = drag.current;
    if (session.pointerId !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Android may cancel a captured pointer while the release event is queued.
    }
    drag.current.pointerId = -1;
    setDragging(false);
    if (canceled || !session.moved) return;

    const container = hostRef.current?.closest<HTMLElement>(".cal-app");
    if (!container) return;
    const bounds = safeBoundsFor(container);
    const rawX = clamp(session.originX + event.clientX - session.startX, EDGE_GAP, Math.max(EDGE_GAP, bounds.width - GROUP_WIDTH - EDGE_GAP));
    const rawY = clamp(session.originY + event.clientY - session.startY, bounds.minY, bounds.maxY);
    const edge = resolveNovaBotEdge(rawX + GROUP_WIDTH / 2, bounds.width);
    const safeVerticalRatio = bounds.maxY > bounds.minY ? (rawY - bounds.minY) / (bounds.maxY - bounds.minY) : 0;
    const next = normalizeNovaBotPresentationPreference({ ...preference, edge, safeVerticalRatio });
    suppressClick.current = true;
    updatePreference(() => next);
    setPosition(avoidMarkedControls(container, positionFromPreference(next, bounds), bounds));
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!preference.movable || menuOpen || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      drag.current.pointerId = -1;
    }
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = drag.current;
    if (session.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (!session.moved && Math.hypot(deltaX, deltaY) < NOVABOT_DRAG_THRESHOLD_PX) return;
    session.moved = true;
    setDragging(true);
    const container = hostRef.current?.closest<HTMLElement>(".cal-app");
    if (!container) return;
    const bounds = safeBoundsFor(container);
    setPosition({
      x: clamp(session.originX + deltaX, EDGE_GAP, Math.max(EDGE_GAP, bounds.width - GROUP_WIDTH - EDGE_GAP)),
      y: clamp(session.originY + deltaY, bounds.minY, bounds.maxY),
    });
  };

  const menuAbove = ready && position.y > (hostRef.current?.closest<HTMLElement>(".cal-app")?.clientHeight ?? 0) / 2;
  const style = {
    "--novabot-x": `${position.x}px`,
    "--novabot-y": `${position.y}px`,
  } as CSSProperties;

  return <div
    ref={hostRef}
    className="global-novabot-anchor"
    data-testid="global-novabot-anchor"
    data-edge={preference.edge}
    data-movable={preference.movable ? "true" : "false"}
    data-dragging={dragging ? "true" : "false"}
    data-ready={ready ? "true" : "false"}
    data-menu-placement={menuAbove ? "above" : "below"}
    hidden={preference.hidden}
    style={style}
  >
    <button
      type="button"
      className="global-novabot-launcher"
      data-testid="global-novabot-trigger"
      aria-label="NovaBot’u aç"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={(event) => finishDrag(event, false)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          return;
        }
        onOpen();
      }}
    ><img src={assetSrc} alt="" draggable={false} /><span className="visually-hidden">NovaBot’u aç</span></button>
    <button
      type="button"
      className="global-novabot-menu-trigger"
      data-testid="global-novabot-menu-trigger"
      aria-label="NovaBot seçenekleri"
      aria-expanded={menuOpen}
      aria-controls="global-novabot-control-menu"
      onClick={() => setMenuOpen((current) => !current)}
    >⋮</button>
    {menuOpen && <div id="global-novabot-control-menu" className="global-novabot-control-menu" data-testid="global-novabot-control-menu" role="menu" aria-label="NovaBot görünüm seçenekleri">
      <button type="button" role="menuitem" onClick={() => requestNovaBotPresentation("hide")}>NovaBot’u gizle</button>
      <button type="button" role="menuitem" aria-current={!preference.movable ? "true" : undefined} disabled={!preference.movable} onClick={() => requestNovaBotPresentation("fixed")}>Bu konumda sabitle</button>
      <button type="button" role="menuitem" aria-current={preference.movable ? "true" : undefined} disabled={preference.movable} onClick={() => requestNovaBotPresentation("movable")}>Hareketli kullan</button>
      <button type="button" role="menuitem" onClick={() => requestNovaBotPresentation("reset")}>Konumu sıfırla</button>
    </div>}
  </div>;
}

export const novaBotPresentationTestUtils = Object.freeze({
  defaultPreference: DEFAULT_PREFERENCE,
  groupWidth: GROUP_WIDTH,
  groupHeight: GROUP_HEIGHT,
  positionFromPreference,
});
