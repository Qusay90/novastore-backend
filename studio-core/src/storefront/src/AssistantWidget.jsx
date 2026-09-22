import { useEffect, useRef, useState } from "react";
import {
  Bot,
  CaretDown,
  ChatCircleText,
  CheckCircle,
  Headphones,
  Heart,
  PaperPlaneTilt,
  ShoppingCart,
  User,
  WarningCircle,
  X,
} from "./CustomerIcon.jsx";
import "./novabot-launcher.css";
const novabotArtwork = "/calibration-assets/official/support_novastore.png";
import {
  createAssistantConversationState,
  scopeAssistantConversationState,
  updateScopedAssistantConversationState,
} from "./integration/assistantConversationState.js";
import { getAssistantModePresentation } from "./integration/assistantModePresentation.js";
import {
  getAssistantViewportMetrics,
  nextModeOptionIndex,
} from "./integration/assistantResponsive.js";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

const HIDDEN_ROUTES = new Set(["payment-result", "auth", "password", "order-success"]);
const INITIAL_CAPABILITY_STATE = Object.freeze({ phase: "loading", value: null });

const isAuthenticated = (session) => (
  session?.status === "authenticated" || session?.status === "unverified"
);

const motionBehavior = () => (
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
);

function AssistantProductCard({ product, favorite, onFavorite, onAdd, getProductImage }) {
  const soldOut = Number(product.stock) <= 0;
  return <article className="assistant-product-card"><a href={`#/urun/${product.slug}`}><img src={getProductImage(product)} alt={product.name} /></a><div><span>{product.brand || "NovaStore"}</span><h4><a href={`#/urun/${product.slug}`}>{product.name}</a></h4><strong>{money.format(product.price)}</strong><div><button type="button" disabled={soldOut} onClick={() => onAdd(product.id)}><ShoppingCart />{soldOut ? "Tükendi" : "Sepete ekle"}</button><button className={favorite ? "is-active" : ""} type="button" aria-pressed={favorite} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"} onClick={() => onFavorite(product.id)}><Heart weight={favorite ? "fill" : "regular"} /></button></div></div></article>;
}

function AssistantResponseExtras({ messageId, response, authenticated, favorites, onFavorite, onAdd, getProductImage, onConfirm, actionPhase }) {
  if (!response) return null;
  const pending = response.requiresConfirmation ? response.pendingAction : null;
  return <>
    {response.products.length > 0 && <div className="assistant-products">{response.products.map((product) => <AssistantProductCard key={product.id} product={product} favorite={favorites.has(product.id)} onFavorite={onFavorite} onAdd={onAdd} getProductImage={getProductImage} />)}</div>}
    {response.comparison && <div className="assistant-comparison"><strong>Doğrulanmış ürün karşılaştırması</strong><div role="table">{response.comparison.rows.map(({ product, bestFor }) => <a role="row" key={product.id} href={`#/urun/${product.slug}`}><span role="cell">{product.name}</span><b role="cell">{money.format(product.price)}</b><small role="cell">{bestFor || (product.stock > 0 ? "Stokta" : "Tükendi")}</small></a>)}</div></div>}
    {pending?.type === "live_support" && !authenticated ? <div className="assistant-confirm"><Headphones /><span><strong>Canlı destek için giriş gerekli</strong><small>Konuşma özetinin yalnız kendi hesabından aktarılması için giriş yap.</small></span><a href="#/giris?return=%2Fdestek">Giriş yap</a></div> : pending ? <div className="assistant-confirm"><CheckCircle /><span><strong>{pending.type === "live_support" ? "Konuşma özetini destek ekibine aktar" : pending.type === "add_to_cart" ? "Ürünü sepete ekle" : "Ürünü sepetten çıkar"}</strong><small>İşlem yalnız onayından sonra uygulanır.</small></span><button type="button" disabled={actionPhase === "submitting"} onClick={() => onConfirm(pending, messageId)}>{actionPhase === "submitting" ? "İşleniyor…" : "Onayla"}</button></div> : null}
  </>;
}

function ConnectedAssistantWidget({
  disabled = false,
  route,
  assistant,
  session,
  favorites,
  onFavorite,
  onAdd,
  onRemove,
  getProductImage,
  raised = false,
  onOpenChange = null,
  conversationState = null,
  onConversationStateChange = null,
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [localConversationState, setLocalConversationState] = useState(() => createAssistantConversationState(session));
  const rawConversation = conversationState || localConversationState;
  const rawSetConversation = onConversationStateChange || setLocalConversationState;
  const conversation = scopeAssistantConversationState(rawConversation, session);
  const conversationInstanceId = conversation.instanceId;
  const setConversation = (update) => rawSetConversation((current) => (
    updateScopedAssistantConversationState(current, session, conversationInstanceId, update)
  ));
  const { mode, error, messages, pendingChatId, pendingActionId } = conversation;
  const [capabilityState, setCapabilityState] = useState(INITIAL_CAPABILITY_STATE);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [activeModeIndex, setActiveModeIndex] = useState(0);
  const phase = pendingChatId === null ? "idle" : "submitting";
  const actionPhase = pendingActionId === null ? "idle" : "submitting";
  const widgetRef = useRef(null);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const fabRef = useRef(null);
  const threadRef = useRef(null);
  const modeMenuRef = useRef(null);
  const modeTriggerRef = useRef(null);
  const modeOptionRefs = useRef([]);
  const chatOperationRef = useRef(pendingChatId);
  const actionOperationRef = useRef(pendingActionId);
  const renderedPendingChatIdRef = useRef(pendingChatId);
  const renderedPendingActionIdRef = useRef(pendingActionId);
  if (pendingChatId !== renderedPendingChatIdRef.current) {
    renderedPendingChatIdRef.current = pendingChatId;
    chatOperationRef.current = pendingChatId;
  }
  if (pendingActionId !== renderedPendingActionIdRef.current) {
    renderedPendingActionIdRef.current = pendingActionId;
    actionOperationRef.current = pendingActionId;
  }
  const authenticated = isAuthenticated(session);
  const capabilityModes = capabilityState.value?.modes || [];
  const selectedServerMode = capabilityModes.find((option) => option.id === mode) || null;
  const selectedServerModeId = selectedServerMode?.id || null;
  const modePresentation = getAssistantModePresentation(capabilityState, selectedServerMode);

  useEffect(() => {
    rawSetConversation((current) => (
      current?.ownerKey === conversation.ownerKey && current?.instanceId ? current : conversation
    ));
  }, [conversation, rawSetConversation]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setCapabilityState(INITIAL_CAPABILITY_STATE);
    const capabilityRequest = typeof assistant?.getCapability === "function"
      ? assistant.getCapability({ signal: controller.signal })
      : Promise.reject(new Error("NovaBot capability contract is unavailable."));
    capabilityRequest.then((capability) => {
      if (!active) return;
      setCapabilityState({ phase: "ready", value: capability });
      const availableIds = new Set(capability.modes.map((option) => option.id));
      rawSetConversation((current) => updateScopedAssistantConversationState(
        current,
        session,
        conversationInstanceId,
        (scoped) => {
          if (availableIds.has(scoped.mode)) return scoped;
          const nextMode = availableIds.has(capability.defaultModeId)
            ? capability.defaultModeId
            : capability.modes[0]?.id;
          return nextMode ? { ...scoped, mode: nextMode } : scoped;
        },
      ));
    }).catch((requestError) => {
      if (!active || requestError?.name === "AbortError") return;
      setCapabilityState({ phase: "error", value: null });
    });
    return () => {
      active = false;
      controller.abort("assistant-capability-owner-change");
    };
  }, [assistant, conversationInstanceId, rawSetConversation, session]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
      if (finePointer) inputRef.current?.focus({ preventScroll: true });
      else dialogRef.current?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (modeMenuOpen) {
        event.preventDefault();
        setModeMenuOpen(false);
        window.requestAnimationFrame(() => modeTriggerRef.current?.focus());
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setOpen(false);
      window.requestAnimationFrame(() => fabRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [modeMenuOpen, open]);

  useEffect(() => {
    if (!open) return undefined;
    const visualViewport = window.visualViewport;
    const syncViewport = () => {
      const metrics = getAssistantViewportMetrics(visualViewport, window.innerHeight);
      widgetRef.current?.style.setProperty("--assistant-visual-viewport-height", `${metrics.height}px`);
      widgetRef.current?.style.setProperty("--assistant-visual-viewport-top", `${metrics.top}px`);
    };
    syncViewport();
    visualViewport?.addEventListener("resize", syncViewport);
    visualViewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      visualViewport?.removeEventListener("resize", syncViewport);
      visualViewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [open]);

  useEffect(() => {
    if (!modeMenuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!modeMenuRef.current?.contains(event.target)) setModeMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [modeMenuOpen]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    window.requestAnimationFrame(() => modeOptionRefs.current[activeModeIndex]?.focus());
  }, [activeModeIndex, modeMenuOpen]);

  useEffect(() => {
    if (disabled || HIDDEN_ROUTES.has(route.type)) {
      setOpen(false);
      setModeMenuOpen(false);
    }
  }, [disabled, route.type]);

  useEffect(() => {
    if (modePresentation.kind !== "selector" || phase === "submitting") setModeMenuOpen(false);
  }, [modePresentation.kind, phase]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open || !threadRef.current) return;
    threadRef.current.scrollTo({ top: threadRef.current.scrollHeight, behavior: motionBehavior() });
  }, [messages, open, phase]);

  if (disabled || HIDDEN_ROUTES.has(route.type)) return null;

  const send = async (rawText) => {
    const text = String(rawText || "").trim();
    if (!text || pendingChatId !== null || chatOperationRef.current !== null) return;
    const operationId = conversation.nextOperationId;
    const history = messages.map((item) => ({ role: item.role, message: item.text }));
    chatOperationRef.current = operationId;
    setConversation((current) => {
      if (current.pendingChatId !== null) return current;
      return {
        ...current,
        messages: [...current.messages, { id: current.nextId, role: "user", text, response: null }],
        nextId: current.nextId + 1,
        nextOperationId: Math.max(current.nextOperationId, operationId + 1),
        pendingChatId: operationId,
        error: "",
      };
    });
    setInput("");
    try {
      const response = await assistant.chat({ message: text, history, modeId: selectedServerModeId });
      setConversation((current) => {
        if (current.pendingChatId !== operationId) return current;
        const responseMode = capabilityModes.some((option) => option.id === response.mode)
          ? response.mode
          : current.mode;
        return {
          ...current,
          mode: responseMode,
          messages: [...current.messages, {
            id: current.nextId,
            role: "assistant",
            text: response.reply,
            response,
          }],
          nextId: current.nextId + 1,
          pendingChatId: null,
        };
      });
    } catch (requestError) {
      const requestMessage = requestError?.message || "NovaBot şu anda yanıt veremiyor.";
      setConversation((current) => current.pendingChatId === operationId
        ? { ...current, pendingChatId: null, error: requestMessage }
        : current);
    } finally {
      if (chatOperationRef.current === operationId) chatOperationRef.current = null;
    }
  };

  const confirm = async (pending, sourceMessageId) => {
    if (pendingActionId !== null || actionOperationRef.current !== null) return;
    const operationId = conversation.nextOperationId;
    actionOperationRef.current = operationId;
    setConversation((current) => {
      if (current.pendingActionId !== null) return current;
      return {
        ...current,
        nextOperationId: Math.max(current.nextOperationId, operationId + 1),
        pendingActionId: operationId,
        error: "",
      };
    });
    try {
      let confirmationMessage = "Onaylanan işlem tamamlandı.";
      if (pending.type === "add_to_cart") {
        const mutationResult = await onAdd(pending.productId, pending.quantity);
        if (mutationResult === true) confirmationMessage = "Onayladığın ürün sepete eklendi.";
        else if (mutationResult?.appliedLocally === true && mutationResult?.persisted === false) {
          confirmationMessage = "Ürün cihazındaki sepete eklendi ancak hesap sepetine kaydedilemedi. Bağlantın düzeldiğinde sepetini yeniden kontrol et.";
        } else throw new Error("Ürün sepete eklenemedi. Güncel stok durumunu kontrol edip yeniden dene.");
      } else if (pending.type === "remove_from_cart") {
        const mutationResult = await onRemove(pending.productId);
        if (mutationResult === true) confirmationMessage = "Onayladığın ürün sepetten çıkarıldı.";
        else if (mutationResult?.appliedLocally === true && mutationResult?.persisted === false) {
          confirmationMessage = "Ürün cihazındaki sepetten çıkarıldı ancak hesap sepeti güncellenemedi. Bağlantın düzeldiğinde sepetini yeniden kontrol et.";
        } else throw new Error("Ürün sepetten çıkarılamadı. Sepetini yenileyip yeniden dene.");
      } else if (pending.type === "live_support") {
        const transcript = messages.slice(-8).map((item) => `${item.role === "user" ? "Müşteri" : "NovaBot"}: ${item.text}`).join("\n");
        const result = await assistant.escalate(`${pending.reason ? `Talep: ${pending.reason}\n` : ""}${transcript}`);
        confirmationMessage = result?.message || "Konuşma özeti destek ekibine iletildi.";
      }
      setConversation((current) => {
        if (current.pendingActionId !== operationId) return current;
        const resolvedMessages = current.messages.map((item) => item.id === sourceMessageId && item.response
          ? { ...item, response: { ...item.response, requiresConfirmation: false, pendingAction: null } }
          : item);
        return {
          ...current,
          messages: [...resolvedMessages, {
            id: current.nextId,
            role: "assistant",
            text: confirmationMessage,
            response: null,
          }],
          nextId: current.nextId + 1,
          pendingActionId: null,
        };
      });
    } catch (requestError) {
      const requestMessage = requestError?.message || "Onaylanan işlem tamamlanamadı.";
      setConversation((current) => current.pendingActionId === operationId
        ? { ...current, pendingActionId: null, error: requestMessage }
        : current);
    } finally {
      if (actionOperationRef.current === operationId) actionOperationRef.current = null;
    }
  };

  const submit = (event) => {
    event.preventDefault();
    send(input);
  };

  const selectedModeIndex = Math.max(0, capabilityModes.findIndex((option) => option.id === selectedServerModeId));
  const focusModeOption = (index) => {
    const boundedIndex = Math.min(capabilityModes.length - 1, Math.max(0, index));
    setActiveModeIndex(boundedIndex);
    window.requestAnimationFrame(() => modeOptionRefs.current[boundedIndex]?.focus());
  };
  const openModeMenu = () => {
    setActiveModeIndex(selectedModeIndex);
    setModeMenuOpen(true);
  };
  const selectMode = (index) => {
    const nextMode = capabilityModes[index];
    if (!nextMode) return;
    setConversation((current) => ({ ...current, mode: nextMode.id }));
    setModeMenuOpen(false);
    window.requestAnimationFrame(() => modeTriggerRef.current?.focus());
  };
  const handleModeTriggerKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = nextModeOptionIndex(selectedModeIndex, capabilityModes.length, event.key);
    if (nextIndex === null) return;
    setModeMenuOpen(true);
    focusModeOption(nextIndex);
  };
  const handleModeOptionKeyDown = (event, index) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      selectMode(index);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setModeMenuOpen(false);
      window.requestAnimationFrame(() => modeTriggerRef.current?.focus());
      return;
    }
    if (event.key === "Tab") {
      setModeMenuOpen(false);
      return;
    }
    const nextIndex = nextModeOptionIndex(index, capabilityModes.length, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    focusModeOption(nextIndex);
  };
  const closeWidget = () => {
    setModeMenuOpen(false);
    setOpen(false);
    window.requestAnimationFrame(() => fabRef.current?.focus());
  };

  return <div ref={widgetRef} className={`assistant-widget is-${route.type}${open ? " is-open" : ""}${raised ? " has-comparison" : ""}`}>
    {open && <section ref={dialogRef} id="novabot-dialog" className="assistant-window" role="dialog" aria-labelledby="novabot-dialog-title" tabIndex="-1">
      <header><span><i><img className="novabot-artwork" src={novabotArtwork} alt="" /></i><span><strong id="novabot-dialog-title">NovaBot</strong><small>{phase === "submitting" ? "Yanıt hazırlanıyor…" : "Canlı katalog asistanı"}</small></span></span><button type="button" aria-label="NovaBot penceresini kapat" onClick={closeWidget}><X /></button></header>
      <div className="assistant-mode">
        {modePresentation.kind === "selector"
          ? <div ref={modeMenuRef} className="assistant-mode__picker"><CheckCircle weight="fill" /><span className="assistant-mode__label">Sohbet modu</span><button ref={modeTriggerRef} className="assistant-mode__trigger" type="button" aria-label={`NovaBot sohbet modu. Seçili: ${selectedServerMode?.label || modePresentation.label}`} aria-haspopup="listbox" aria-expanded={modeMenuOpen} aria-controls="novabot-mode-listbox" aria-describedby="novabot-mode-description" disabled={phase === "submitting"} onClick={() => modeMenuOpen ? setModeMenuOpen(false) : openModeMenu()} onKeyDown={handleModeTriggerKeyDown}><span>{selectedServerMode?.label || modePresentation.label}</span><CaretDown /></button>{modeMenuOpen && <div id="novabot-mode-listbox" className="assistant-mode__listbox" role="listbox" aria-label="NovaBot sohbet modları" aria-activedescendant={`novabot-mode-option-${activeModeIndex}`}>{capabilityModes.map((option, index) => <button ref={(element) => { modeOptionRefs.current[index] = element; }} id={`novabot-mode-option-${index}`} key={option.id} className={option.id === selectedServerModeId ? "is-selected" : ""} type="button" role="option" aria-selected={option.id === selectedServerModeId} tabIndex={index === activeModeIndex ? 0 : -1} onFocus={() => setActiveModeIndex(index)} onClick={() => selectMode(index)} onKeyDown={(event) => handleModeOptionKeyDown(event, index)}><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>{option.id === selectedServerModeId && <CheckCircle weight="fill" aria-hidden="true" />}</button>)}</div>}<span id="novabot-mode-description" className="sr-only" role="status" aria-live="polite">Seçili mod: {selectedServerMode?.label || modePresentation.label}. {selectedServerMode?.description || ""}</span></div>
          : <div className="assistant-mode__status" role="status" aria-label={`NovaBot sohbet modu: ${modePresentation.label}. ${modePresentation.detail}`}><CheckCircle weight="fill" /><span><strong>{modePresentation.label}</strong>{modePresentation.detail && <small>{modePresentation.detail}</small>}</span></div>}
        <a href="#/destek"><Headphones /> Destek ekibi</a>
      </div>
      <div className="assistant-thread" ref={threadRef} aria-live="polite">
        {messages.map((message) => <article key={message.id} className={`assistant-message is-${message.role}`}><div className="assistant-message__icon">{message.role === "user" ? <User /> : <Bot />}</div><div className="assistant-message__body"><p>{message.text}</p><AssistantResponseExtras messageId={message.id} response={message.response} authenticated={authenticated} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} getProductImage={getProductImage} onConfirm={confirm} actionPhase={actionPhase} />{message.response?.suggestions?.length > 0 && <div className="assistant-suggestions">{message.response.suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={phase === "submitting"} onClick={() => send(suggestion)}>{suggestion}</button>)}</div>}</div></article>)}
        {phase === "submitting" && <div className="assistant-typing" role="status"><span /><span /><span /><b>NovaBot düşünüyor</b></div>}
        {error && <div className="assistant-error" role="alert"><WarningCircle />{error}<button type="button" onClick={() => setConversation((current) => ({ ...current, error: "" }))} aria-label="Hatayı kapat"><X /></button></div>}
      </div>
      <form className="assistant-composer" onSubmit={submit}><label className="sr-only" htmlFor="assistant-message">NovaBot’a mesaj yaz</label><input ref={inputRef} id="assistant-message" value={input} maxLength="2000" autoComplete="off" placeholder="Ürün, fiyat veya destek hakkında sor…" onChange={(event) => setInput(event.target.value)} /><button type="submit" disabled={phase === "submitting" || !input.trim()} aria-label="Mesajı gönder"><PaperPlaneTilt weight="fill" /></button></form>
      <footer>NovaBot hata yapabilir; fiyat ve stok canlı katalogdan doğrulanır.</footer>
    </section>}
    <button ref={fabRef} className="assistant-fab" type="button" aria-controls="novabot-dialog" aria-expanded={open} aria-haspopup="dialog" aria-label={open ? "NovaBot penceresini kapat" : "NovaBot alışveriş asistanını aç"} onClick={() => open ? closeWidget() : setOpen(true)}>{open ? <X /> : <img className="novabot-launcher-avatar" src={novabotArtwork} alt="NovaBot" />}</button>
  </div>;
}

function PreviewAssistantWidget({ route, raised = false, disabled = false, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState("");
  const launcherRef = useRef(null);
  const dialogRef = useRef(null);
  const close = () => { setOpen(false); window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true })); };
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => { setOpen(false); }, [route.type]);
  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus({ preventScroll: true });
    const escape = event => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return <div className={`assistant-widget nova-preview-assistant is-${route.type}${open ? " is-open" : ""}${raised ? " has-comparison" : ""}`}>
    {open && <section id="novabot-dialog" ref={dialogRef} className="assistant-window" role="dialog" aria-labelledby="novabot-dialog-title" tabIndex={-1}>
      <header><span><i><img className="novabot-artwork" src={novabotArtwork} alt="" /></i><span><strong id="novabot-dialog-title">NovaBot</strong><small>Nova Store demo rehberi</small></span></span><button type="button" onClick={close} aria-label="NovaBot penceresini kapat"><X /></button></header>
      <div className="nova-preview-assistant-status" role="status">Yapay zekâ servisi bu önizlemeye bağlı değil.</div>
      <div className="nova-preview-assistant-body">
        <p>Merhaba, ben NovaBot. Bu tasarımı keşfederken alışveriş ve yardım sayfalarına buradan ulaşabilirsin.</p>
        <div className="nova-preview-assistant-links"><a href="#/kategoriler" onClick={close}><ShoppingCart />Ürünleri keşfet</a><a href="#/sepet" onClick={close}><ShoppingCart />Sepetim</a><a href="#/destek" onClick={close}><Headphones />Yardım merkezi</a></div>
        <button type="button" className="nova-preview-assistant-question" onClick={() => setTip(disabled ? "Bu mağaza önizlemesi salt okunurdur. Sepet ve hesap değişiklikleri yapılmaz; sayfaların görünümünü inceleyebilirsin." : "Ürün kartından sepete ekleyebilir, sepet sayfasında adetleri değiştirebilirsin. Buradaki ürün ve sipariş akışları örnektir; gerçek ödeme yapılmaz.")}>Bu demo nasıl çalışıyor?</button>
        {tip && <p className="nova-preview-assistant-tip" role="status">{tip}</p>}
      </div><footer>Canlı NovaBot bağlantısı mağazanın yetkili servisiyle etkinleştirilir.</footer>
    </section>}
    <button ref={launcherRef} className="assistant-fab" type="button" aria-label={open ? "NovaBot penceresini kapat" : "NovaBot alışveriş asistanını aç"} aria-controls="novabot-dialog" aria-expanded={open} aria-haspopup="dialog" onClick={() => open ? close() : setOpen(true)}>{open ? <X /> : <img className="novabot-launcher-avatar" src={novabotArtwork} alt="NovaBot" />}</button>
  </div>;
}

export function AssistantWidget(props) {
  return props.disabled || props.assistant?.demo === true
    ? <PreviewAssistantWidget {...props} />
    : <ConnectedAssistantWidget {...props} />;
}

export const assistantWidgetTestUtils = Object.freeze({ HIDDEN_ROUTES, isAuthenticated });
