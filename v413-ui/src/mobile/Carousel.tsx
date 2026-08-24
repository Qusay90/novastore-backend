import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react";

export type CarouselProps = PropsWithChildren<{
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  showScrollbar?: boolean;
  draggingEnabled?: boolean;
  paged?: boolean;
  circular?: boolean;
  page?: number;
  onPageChange?: (page: number) => void;
}>;

const physics = {
  friction: 2.1,
  velocityScale: 890,
  velocityTolerance: 18,
  bounceTension: 200,
  bounceFriction: 40,
  overdragScale: 0.5,
  maxOverdrag: 96,
  sampleWindow: 100,
  dragThreshold: 8,
  axisLockRatio: 1.35,
} as const;

export function pagedCarouselBounds(startPage: number, viewport: number, maximumOffset: number) {
  const safeViewport = Math.max(1, viewport);
  const maximumPage = Math.max(0, Math.ceil(maximumOffset / safeViewport));
  const clamp = (value: number) => Math.max(0, Math.min(maximumPage, Math.round(value)));
  const pageOffset = (value: number) => Math.min(maximumOffset, clamp(value) * safeViewport);
  return [pageOffset(startPage - 1), pageOffset(startPage + 1)] as const;
}

export function resolvePagedCarouselTarget({
  startPage,
  displacement,
  velocity,
  viewport,
  maximumPage,
  canceled = false,
}: {
  startPage: number;
  displacement: number;
  velocity: number;
  viewport: number;
  maximumPage: number;
  canceled?: boolean;
}) {
  const distanceThreshold = Math.min(72, Math.max(1, viewport) * 0.18);
  const velocityThreshold = 240;
  const direction = canceled
    ? 0
    : Math.abs(displacement) >= distanceThreshold
      ? Math.sign(displacement)
      : Math.abs(velocity) >= velocityThreshold
        ? Math.sign(velocity)
        : 0;
  return Math.max(0, Math.min(maximumPage, startPage + direction));
}

export function pagedCarouselSettleProgress(value: number) {
  const progress = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - progress, 3);
}

export function normalizeCircularCarouselPage(value: number, pageCount: number) {
  const count = Math.max(0, Math.floor(pageCount));
  if (count <= 1) return 0;
  const rounded = Math.round(value);
  return ((rounded % count) + count) % count;
}

export function circularCarouselPhysicalPage(logicalPage: number, pageCount: number) {
  const count = Math.max(0, Math.floor(pageCount));
  return count > 1 ? normalizeCircularCarouselPage(logicalPage, count) + 1 : 0;
}

export function circularCarouselLogicalPage(physicalPage: number, pageCount: number) {
  const count = Math.max(0, Math.floor(pageCount));
  return count > 1 ? normalizeCircularCarouselPage(Math.round(physicalPage) - 1, count) : 0;
}

export function normalizeCircularCarouselPhysicalPage(physicalPage: number, pageCount: number) {
  const count = Math.max(0, Math.floor(pageCount));
  if (count <= 1) return 0;
  const rounded = Math.round(physicalPage);
  if (rounded <= 0) return count;
  if (rounded >= count + 1) return 1;
  return rounded;
}

export function circularCarouselControlledPhysicalTarget({
  currentLogicalPage,
  requestedLogicalPage,
  pageCount,
}: {
  currentLogicalPage: number;
  requestedLogicalPage: number;
  pageCount: number;
}) {
  const count = Math.max(0, Math.floor(pageCount));
  if (count <= 1) return 0;
  const current = normalizeCircularCarouselPage(currentLogicalPage, count);
  const requested = normalizeCircularCarouselPage(requestedLogicalPage, count);
  if (current === count - 1 && requested === 0) return count + 1;
  if (current === 0 && requested === count - 1) return 0;
  return circularCarouselPhysicalPage(requested, count);
}

function cloneCircularEdge(child: ReactNode, edge: "leading" | "trailing") {
  if (!isValidElement(child)) return child;
  return cloneElement(child as ReactElement<Record<string, unknown>>, {
    key: `mobile-carousel-${edge}-clone`,
    "aria-hidden": true,
    "data-carousel-clone": edge,
    inert: true,
    tabIndex: -1,
  });
}

type Sample = { value: number; time: number };
type DragSession = {
  pointerId: number;
  startPrimary: number;
  startCross: number;
  startOffset: number;
  startPage: number;
  captured: boolean;
  dragged: boolean;
};

export function Carousel({
  className,
  contentClassName,
  ariaLabel,
  showScrollbar = false,
  draggingEnabled = true,
  paged = false,
  circular = false,
  page,
  onPageChange,
  children,
}: CarouselProps) {
  const logicalChildren = useMemo(() => Children.toArray(children), [children]);
  const logicalPageCount = logicalChildren.length;
  const circularPaged = paged && circular && logicalPageCount > 1;
  const renderedChildren = useMemo(() => circularPaged
    ? [
        cloneCircularEdge(logicalChildren[logicalPageCount - 1], "leading"),
        ...logicalChildren,
        cloneCircularEdge(logicalChildren[0], "trailing"),
      ]
    : logicalChildren, [circularPaged, logicalChildren, logicalPageCount]);
  const initialLogicalPage = circularPaged
    ? normalizeCircularCarouselPage(page ?? 0, logicalPageCount)
    : Math.max(0, Math.floor(page ?? 0));
  const initialPhysicalPage = circularPaged
    ? circularCarouselPhysicalPage(initialLogicalPage, logicalPageCount)
    : initialLogicalPage;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const samplesRef = useRef<Sample[]>([]);
  const frameRef = useRef<number | null>(null);
  const overdragRef = useRef(0);
  const suppressClickRef = useRef(false);
  const controlledPageRef = useRef(page);
  const committedPageRef = useRef(initialPhysicalPage);
  const targetPageRef = useRef(committedPageRef.current);
  const onPageChangeRef = useRef(onPageChange);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [activePage, setActivePage] = useState(initialLogicalPage);
  const [overdrag, setOverdrag] = useState(0);
  const [thumb, setThumb] = useState({ visible: false, offset: 0, size: 0 });

  const offset = useCallback((node: HTMLDivElement) => node.scrollLeft, []);
  const setOffset = useCallback((node: HTMLDivElement, value: number) => {
    node.scrollLeft = value;
  }, []);
  const clientSize = useCallback((node: HTMLDivElement) => node.clientWidth, []);
  const scrollSize = useCallback((node: HTMLDivElement) => node.scrollWidth, []);
  const maxOffset = useCallback((node: HTMLDivElement) => Math.max(0, scrollSize(node) - clientSize(node)), [clientSize, scrollSize]);
  const maxPage = useCallback((node: HTMLDivElement) => {
    if (paged && logicalPageCount > 0) return circularPaged ? logicalPageCount + 1 : logicalPageCount - 1;
    const viewport = clientSize(node);
    return viewport > 0 ? Math.max(0, Math.ceil(maxOffset(node) / viewport)) : 0;
  }, [circularPaged, clientSize, logicalPageCount, maxOffset, paged]);
  const clampPage = useCallback((node: HTMLDivElement, value: number) => (
    Math.max(0, Math.min(maxPage(node), Math.round(value)))
  ), [maxPage]);
  const pageOffset = useCallback((node: HTMLDivElement, value: number) => {
    const targetPage = clampPage(node, value);
    const target = node.firstElementChild?.children[targetPage];
    if (paged && target instanceof HTMLElement) {
      return Math.max(0, Math.min(maxOffset(node), target.offsetLeft));
    }
    return Math.min(maxOffset(node), targetPage * clientSize(node));
  }, [clampPage, clientSize, maxOffset, offset, paged]);
  const pageAtOffset = useCallback((node: HTMLDivElement) => {
    const currentOffset = offset(node);
    let closestPage = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate <= maxPage(node); candidate += 1) {
      const distance = Math.abs(pageOffset(node, candidate) - currentOffset);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = candidate;
      }
    }
    return closestPage;
  }, [maxPage, offset, pageOffset]);
  const logicalPageForPhysical = useCallback((physicalPage: number) => circularPaged
    ? circularCarouselLogicalPage(physicalPage, logicalPageCount)
    : Math.max(0, Math.round(physicalPage)), [circularPaged, logicalPageCount]);
  const normalizedPhysicalPage = useCallback((physicalPage: number) => circularPaged
    ? normalizeCircularCarouselPhysicalPage(physicalPage, logicalPageCount)
    : Math.max(0, Math.round(physicalPage)), [circularPaged, logicalPageCount]);

  const stopMotion = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);
  controlledPageRef.current = page;
  const setRubberBand = useCallback((value: number) => {
    const next = Math.max(-physics.maxOverdrag, Math.min(physics.maxOverdrag, value));
    overdragRef.current = next;
    setOverdrag(next);
  }, []);

  const updateThumb = useCallback((visible = true) => {
    if (!showScrollbar || !scrollRef.current) return;
    const node = scrollRef.current;
    const viewport = clientSize(node);
    const content = scrollSize(node);
    const enabled = content > viewport + 2;
    const size = enabled ? Math.max(36, (viewport / content) * viewport) : 0;
    const track = Math.max(0, viewport - size - 8);
    const progress = offset(node) / Math.max(1, content - viewport);
    setThumb({ visible: visible && enabled, size, offset: enabled ? 4 + progress * track : 0 });
  }, [clientSize, offset, scrollSize, showScrollbar]);

  const springBack = useCallback((initialVelocity = 0) => {
    stopMotion();
    let position = overdragRef.current;
    let velocity = Math.max(-1400, Math.min(1400, initialVelocity));
    let previous: number | null = null;
    const tick = (time: number) => {
      const seconds = Math.min(0.034, ((previous === null ? 16 : time - previous) || 16) / 1000);
      previous = time;
      velocity += (-physics.bounceTension * position - physics.bounceFriction * velocity) * seconds;
      position += velocity * seconds;
      if (Math.abs(position) < 0.5 && Math.abs(velocity) < 0.5) {
        setRubberBand(0);
        frameRef.current = null;
        return;
      }
      setRubberBand(position);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
  }, [setRubberBand, stopMotion]);

  const settlePage = useCallback((node: HTMLDivElement, requestedPage: number, notify: boolean) => {
    const target = clampPage(node, requestedPage);
    const previousLogicalPage = logicalPageForPhysical(committedPageRef.current);
    const start = offset(node);
    const end = pageOffset(node, target);
    const distance = end - start;
    targetPageRef.current = target;
    stopMotion();
    setRubberBand(0);

    const complete = () => {
      setOffset(node, end);
      const logicalTarget = logicalPageForPhysical(target);
      const normalizedTarget = normalizedPhysicalPage(target);
      if (normalizedTarget !== target) setOffset(node, pageOffset(node, normalizedTarget));
      committedPageRef.current = normalizedTarget;
      targetPageRef.current = normalizedTarget;
      setActivePage(logicalTarget);
      setSettling(false);
      updateThumb(true);
      if (notify && logicalTarget !== previousLogicalPage) onPageChangeRef.current?.(logicalTarget);
    };

    if (Math.abs(distance) < 0.5) {
      complete();
      return;
    }

    setSettling(true);
    const duration = Math.max(180, Math.min(280, 180 + Math.abs(distance) * 0.24));
    let startedAt: number | null = null;
    const tick = (time: number) => {
      if (startedAt === null) startedAt = time;
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = pagedCarouselSettleProgress(progress);
      setOffset(node, start + distance * eased);
      updateThumb(true);
      if (progress >= 1) {
        frameRef.current = null;
        complete();
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
  }, [clampPage, logicalPageForPhysical, normalizedPhysicalPage, offset, pageOffset, setOffset, setRubberBand, stopMotion, updateThumb]);

  const momentum = useCallback((node: HTMLDivElement, initialVelocity: number) => {
    let velocity = initialVelocity;
    let previous: number | null = null;
    const tick = (time: number) => {
      const seconds = (previous === null ? 16 : Math.min(34, time - previous)) / 1000;
      previous = time;
      velocity *= Math.exp(-physics.friction * seconds);
      if (Math.abs(velocity) < physics.velocityTolerance) {
        frameRef.current = null;
        updateThumb(true);
        return;
      }
      const next = offset(node) + velocity * seconds;
      const maximum = maxOffset(node);
      if (next < 0 || next > maximum) {
        setOffset(node, Math.max(0, Math.min(maximum, next)));
        // Match MobileScroll's edge convention: positive displacement at the
        // leading edge, negative displacement at the trailing edge.
        setRubberBand((next < 0 ? -next : maximum - next) * physics.overdragScale);
        springBack(velocity * physics.overdragScale);
        return;
      }
      setOffset(node, next);
      updateThumb(true);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    if (Math.abs(velocity) >= physics.velocityTolerance) frameRef.current = window.requestAnimationFrame(tick);
  }, [maxOffset, offset, setOffset, setRubberBand, springBack, updateThumb]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!paged || !node) return;
    const requested = controlledPageRef.current ?? logicalPageForPhysical(committedPageRef.current);
    const logicalTarget = circularPaged
      ? normalizeCircularCarouselPage(requested, logicalPageCount)
      : clampPage(node, requested);
    const physicalTarget = circularPaged
      ? circularCarouselPhysicalPage(logicalTarget, logicalPageCount)
      : logicalTarget;
    stopMotion();
    committedPageRef.current = physicalTarget;
    targetPageRef.current = physicalTarget;
    setActivePage(logicalTarget);
    setSettling(false);
    setRubberBand(0);
    setOffset(node, pageOffset(node, physicalTarget));
  }, [circularPaged, clampPage, logicalPageCount, logicalPageForPhysical, pageOffset, paged, setOffset, setRubberBand, stopMotion]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = () => updateThumb(true);
    const observer = new ResizeObserver(() => {
      updateThumb(false);
      if (!paged || frameRef.current !== null) return;
      const target = clampPage(node, targetPageRef.current);
      const normalizedTarget = normalizedPhysicalPage(target);
      targetPageRef.current = normalizedTarget;
      committedPageRef.current = normalizedTarget;
      setActivePage(logicalPageForPhysical(target));
      setOffset(node, pageOffset(node, normalizedTarget));
    });
    node.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    updateThumb(false);
    return () => {
      node.removeEventListener("scroll", onScroll);
      observer.disconnect();
      stopMotion();
    };
  }, [clampPage, logicalPageForPhysical, normalizedPhysicalPage, pageOffset, paged, setOffset, stopMotion, updateThumb]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!paged || page === undefined || !node) return;
    const requestedLogicalPage = circularPaged
      ? normalizeCircularCarouselPage(page, logicalPageCount)
      : clampPage(node, page);
    const currentLogicalPage = logicalPageForPhysical(committedPageRef.current);
    const target = circularPaged
      ? circularCarouselControlledPhysicalTarget({ currentLogicalPage, requestedLogicalPage, pageCount: logicalPageCount })
      : requestedLogicalPage;
    const canonicalTarget = circularPaged
      ? circularCarouselPhysicalPage(requestedLogicalPage, logicalPageCount)
      : target;
    const canonicalOffset = pageOffset(node, canonicalTarget);
    if (frameRef.current !== null && logicalPageForPhysical(targetPageRef.current) === requestedLogicalPage) return;
    if (currentLogicalPage === requestedLogicalPage && Math.abs(offset(node) - canonicalOffset) < 0.5) return;
    settlePage(node, target, false);
  }, [circularPaged, clampPage, logicalPageCount, logicalPageForPhysical, offset, page, pageOffset, paged, settlePage]);

  const primary = (event: ReactPointerEvent<HTMLDivElement>) => event.clientX;
  const cross = (event: ReactPointerEvent<HTMLDivElement>) => event.clientY;
  const record = (value: number) => {
    const time = performance.now();
    samplesRef.current = [...samplesRef.current, { value, time }].filter((sample) => time - sample.time <= physics.sampleWindow);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    if (!draggingEnabled || !node || maxOffset(node) <= 2 || (event.pointerType === "mouse" && event.button !== 0)) return;
    stopMotion();
    if (paged) setSettling(false);
    samplesRef.current = [];
    record(primary(event));
    setRubberBand(0);
    const measuredPage = paged ? pageAtOffset(node) : 0;
    const startPage = paged ? normalizedPhysicalPage(measuredPage) : 0;
    if (paged) {
      committedPageRef.current = startPage;
      targetPageRef.current = startPage;
      setActivePage(logicalPageForPhysical(startPage));
    }
    sessionRef.current = { pointerId: event.pointerId, startPrimary: primary(event), startCross: cross(event), startOffset: offset(node), startPage, captured: false, dragged: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    const session = sessionRef.current;
    if (!node || !session || session.pointerId !== event.pointerId) return;
    const delta = primary(event) - session.startPrimary;
    const crossDelta = cross(event) - session.startCross;
    if (!session.dragged) {
      // Keep the gesture pending until it clears tap slop. Pointer-down and
      // these early moves must bubble so a parent MobileScroll can still win.
      if (Math.max(Math.abs(delta), Math.abs(crossDelta)) < physics.dragThreshold) return;
      const horizontalIntent = (
        Math.abs(delta) >= physics.dragThreshold &&
        Math.abs(delta) >= Math.abs(crossDelta) * physics.axisLockRatio
      );
      if (!horizontalIntent && Math.abs(crossDelta) >= physics.dragThreshold) {
        // The cross axis won. Abandon this session without capturing or
        // canceling the event so the parent can handle this move and release.
        // Requiring clear horizontal dominance prevents a small initial finger
        // wobble from stealing a vertical product-list scroll.
        sessionRef.current = null;
        if (paged) settlePage(node, session.startPage, false);
        return;
      }
      if (!horizontalIntent) return;
      // The scroller owns the gesture from this move onward. Capture keeps
      // delivery stable outside its bounds; stopping propagation prevents the
      // parent from accumulating vertical drift or release momentum.
      event.currentTarget.setPointerCapture(event.pointerId);
      session.captured = true;
    }
    event.preventDefault();
    event.stopPropagation();
    session.dragged = true;
    setDragging(true);
    suppressClickRef.current = true;
    record(primary(event));
    const desired = session.startOffset - delta;
    if (paged) {
      const minimumPageOffset = pageOffset(node, session.startPage - 1);
      const maximumPageOffset = pageOffset(node, session.startPage + 1);
      setOffset(node, Math.max(minimumPageOffset, Math.min(maximumPageOffset, desired)));
      setRubberBand(0);
    } else {
      const maximum = maxOffset(node);
      setOffset(node, Math.max(0, Math.min(maximum, desired)));
      setRubberBand(desired < 0 ? -desired * physics.overdragScale : desired > maximum ? -(desired - maximum) * physics.overdragScale : 0);
    }
    updateThumb(true);
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, canceled = false) => {
    const node = scrollRef.current;
    const session = sessionRef.current;
    if (!node || !session || session.pointerId !== event.pointerId) return;
    if (session.captured) event.currentTarget.releasePointerCapture(event.pointerId);
    const samples = samplesRef.current;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const velocity = first && last ? -((last.value - first.value) / Math.max(1, last.time - first.time)) * physics.velocityScale : 0;
    sessionRef.current = null;
    setDragging(false);
    if (session.dragged) event.preventDefault();
    if (paged) {
      const viewport = Math.max(1, clientSize(node));
      const displacement = offset(node) - session.startOffset;
      const target = resolvePagedCarouselTarget({
        startPage: session.startPage,
        displacement,
        velocity,
        viewport,
        maximumPage: maxPage(node),
        canceled,
      });
      settlePage(node, target, true);
      return;
    }
    if (Math.abs(overdragRef.current) > 0.1) springBack(velocity * physics.overdragScale);
    else momentum(node, velocity);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const style = { "--mobile-carousel-overdrag": `${overdrag}px` } as CSSProperties;
  const thumbStyle = { width: thumb.size, transform: `translateX(${thumb.offset}px)` };

  return (
    <div
      ref={scrollRef}
      className={`mobile-carousel ${className ?? ""}`}
      data-dragging={dragging}
      data-paged={paged ? "true" : "false"}
      data-circular={paged ? (circularPaged ? "true" : "false") : undefined}
      data-page={paged ? activePage : undefined}
      data-target-page={paged ? logicalPageForPhysical(targetPageRef.current) : undefined}
      data-physical-page={paged ? committedPageRef.current : undefined}
      data-target-physical-page={paged ? targetPageRef.current : undefined}
      data-settling={paged ? settling : undefined}
      data-overscroll={overdrag.toFixed(2)}
      aria-label={ariaLabel}
      role={ariaLabel ? "region" : undefined}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={(event) => finish(event, true)}
      onClickCapture={onClickCapture}
    >
      <div className={`mobile-carousel-content ${contentClassName ?? ""}`}>{renderedChildren}</div>
      {showScrollbar ? (
        <div className="mobile-carousel-scrollbar" data-visible={thumb.visible} aria-hidden="true">
          <div className="mobile-carousel-scrollbar-thumb" style={thumbStyle} />
        </div>
      ) : null}
    </div>
  );
}
