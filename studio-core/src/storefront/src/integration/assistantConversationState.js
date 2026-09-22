const INTRO_MESSAGE = Object.freeze({
  id: 1,
  role: "assistant",
  text: "Merhaba, ben NovaBot. Canlı katalogdan ürün bulabilir, karşılaştırabilir ve gerektiğinde seni destek ekibine aktarabilirim.",
  response: null,
});

let assistantConversationInstanceSequence = 0;

const createAssistantConversationInstanceId = () => {
  assistantConversationInstanceSequence += 1;
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId
    ? `assistant:${randomId}`
    : `assistant-local:${Date.now().toString(36)}:${assistantConversationInstanceSequence.toString(36)}`;
};

export const assistantConversationOwnerKey = (session) => {
  const authenticated = session?.status === "authenticated" || session?.status === "unverified";
  if (!authenticated) return "guest";
  const userId = Number(session?.user?.id);
  return Number.isSafeInteger(userId) && userId > 0 ? `customer:${userId}` : "customer:unknown";
};

export const createAssistantConversationState = (session = null) => ({
  ownerKey: assistantConversationOwnerKey(session),
  instanceId: createAssistantConversationInstanceId(),
  mode: "friendly",
  error: "",
  messages: [{ ...INTRO_MESSAGE }],
  nextId: 2,
  nextOperationId: 1,
  pendingChatId: null,
  pendingActionId: null,
});

export const scopeAssistantConversationState = (state, session) => {
  const ownerKey = assistantConversationOwnerKey(session);
  return state?.ownerKey === ownerKey ? state : createAssistantConversationState(session);
};

export const updateScopedAssistantConversationState = (state, session, instanceId, update) => {
  const ownerKey = assistantConversationOwnerKey(session);
  if (state?.ownerKey !== ownerKey || state?.instanceId !== instanceId) return state;
  const next = typeof update === "function" ? update(state) : update;
  if (!next || typeof next !== "object") return state;
  if (next === state) return state;
  return { ...next, ownerKey, instanceId };
};
