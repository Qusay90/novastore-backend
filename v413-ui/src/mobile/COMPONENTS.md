# Mobile runtime components

## Carousel

`Carousel` is the standard component for horizontal collections: cards, images, media, swipeable items, and chip or filter rails. Place it directly inside `MobileScroll`; consumers should not add gesture wrappers or pointer handlers.

```tsx
<MobileScroll>
  <section>
    <Carousel
      ariaLabel="Event details"
      className="event-carousel"
      contentClassName="event-carousel-track"
    >
      {cards}
    </Carousel>
  </section>
</MobileScroll>
```

The runtime resolves nested gestures by axis. Horizontal intent stays with `Carousel`; vertical intent is handed to the parent `MobileScroll`. Slight vertical drift after a horizontal gesture is claimed does not move, rubber-band, or add momentum to the parent. Taps remain clickable, while a completed drag suppresses the item click.

Do not use `data-scroll-drag="ignore"` for carousels or ordinary rails. It is a hard opt-out that prevents parent scrolling in every direction. Do not layer CSS scroll snapping over the runtime's JavaScript momentum. If snapping is added later, it should be a component option so one system owns release motion.

For a one-item-per-viewport gallery, opt into the runtime-owned paged mode instead of adding consumer scroll timers or CSS snapping:

```tsx
const [page, setPage] = useState(0);

<Carousel
  paged
  page={page}
  onPageChange={setPage}
  ariaLabel="Product photos"
  className="product-gallery"
  contentClassName="product-gallery-track"
>
  {photos}
</Carousel>
```

Paged mode treats one carousel viewport as one page, so each direct track item must be exactly one viewport wide with no inter-page gap. A gesture can settle only to the current page or one adjacent page, regardless of release velocity. It does not run free momentum, rubber-band past a page, or add a second consumer-owned settle. Updating the controlled `page` prop performs one bounded runtime settle and `onPageChange` reports a completed gesture-driven page change. Keep the default mode for free-scrolling card rails and recommendations; omitting `paged` preserves their existing momentum and edge rubber-banding.

Add `circular` only to a controlled paged media gallery that must wrap in both directions. The runtime inserts inert, `aria-hidden` edge transition clones, reports only logical pages through `data-page` and `onPageChange`, and normalizes each completed edge transition onto the matching original slide. Consumers must still render one direct item per logical media source and must not duplicate sources, implement modulo pointer handlers, or add their own clone normalization. One-item galleries remain stationary.

## Keyboard-linked surfaces

Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for all text entry. Position a composer, search surface, or other keyboard-linked UI from `useKeyboardInsets().bottomInset`. The inset is relative to the app viewport: Android's closed-keyboard viewport already ends above its navigation bar, while iOS still needs its overlaid home-indicator inset; both platforms return the keyboard height while the keyboard is open. Never pin those surfaces to only `keyboardHeight`. When that surface closes, call `keyboard.hide()` in the same event before updating its own open state.

## BottomSheet

`BottomSheet` dismisses the keyboard before opening and animates both in and out by default. Keep its `open` state controlled through `onOpenChange`; no consumer exit-animation wrapper is needed.
