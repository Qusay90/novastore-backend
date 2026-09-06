export const CUSTOMER_NOTIFICATION_EVENT_TYPES = Object.freeze([
  "ORDER_CREATED",
  "ORDER_CANCEL_REQUESTED",
  "CANCELLATION_RESULT",
  "ORDER_STATUS_CHANGED",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "PAYMENT_ACTION_REQUIRED",
  "REFUND_STATUS_CHANGED",
  "SHIPMENT_CREATED",
  "TRACKING_UPDATED",
  "ORDER_DELIVERED",
  "RETURN_REQUESTED",
  "RETURN_STATUS_CHANGED",
  "SUPPORT_REPLY",
  "QUESTION_ANSWERED",
  "REVIEW_MODERATION_RESULT",
] as const);

export type CustomerNotificationEventType = typeof CUSTOMER_NOTIFICATION_EVENT_TYPES[number];
export type CustomerNotificationCategory = "ACCOUNT" | "ORDER" | "PAYMENT" | "SHIPPING" | "RETURN" | "SUPPORT" | "QUESTION_REVIEW";
export type CustomerNotificationPriority = "NORMAL" | "HIGH" | "CRITICAL";
export type CustomerNotificationEntityType =
  | "order"
  | "payment"
  | "product"
  | "product_question"
  | "return_request"
  | "review"
  | "seller_application"
  | "shipment"
  | "store"
  | "support_thread";

export type CustomerNotificationTarget = Readonly<{
  entityType: CustomerNotificationEntityType;
  entityId?: number;
  entityKey?: string;
}>;

export type CustomerNotification = Readonly<{
  id: number;
  type: CustomerNotificationEventType;
  category: CustomerNotificationCategory;
  priority: CustomerNotificationPriority;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  target: CustomerNotificationTarget | null;
}>;

export type CustomerNotificationPage = Readonly<{
  items: readonly CustomerNotification[];
  page: Readonly<{ limit: number; hasMore: boolean; nextCursor: string | null }>;
}>;

export type CustomerPushPayload = Readonly<{
  notificationId: number;
  type: CustomerNotificationEventType;
  category: CustomerNotificationCategory;
  priority: CustomerNotificationPriority;
  title: string;
  body: string;
  target: CustomerNotificationTarget | null;
}>;

export type CustomerNotificationDestination = Readonly<{
  cal: "CAL-06" | "CAL-09" | "CAL-10" | "CAL-11";
  tab: "home" | "account" | "support";
  view: "" | "notifications" | "returns" | "questions" | "reviews" | "history";
  productId?: string;
  returnId?: string;
}>;

const eventTypes = new Set<string>(CUSTOMER_NOTIFICATION_EVENT_TYPES);
const categories = new Set<string>(["ACCOUNT", "ORDER", "PAYMENT", "SHIPPING", "RETURN", "SUPPORT", "QUESTION_REVIEW"]);
const priorities = new Set<string>(["NORMAL", "HIGH", "CRITICAL"]);
const eventRules: Record<CustomerNotificationEventType, Readonly<{ category: CustomerNotificationCategory; priority: CustomerNotificationPriority; entityType: CustomerNotificationEntityType }>> = Object.freeze({
  ORDER_CREATED: { category: "ORDER", priority: "HIGH", entityType: "order" },
  ORDER_CANCEL_REQUESTED: { category: "ORDER", priority: "HIGH", entityType: "order" },
  CANCELLATION_RESULT: { category: "ORDER", priority: "HIGH", entityType: "order" },
  ORDER_STATUS_CHANGED: { category: "ORDER", priority: "NORMAL", entityType: "order" },
  PAYMENT_SUCCESS: { category: "PAYMENT", priority: "HIGH", entityType: "order" },
  PAYMENT_FAILED: { category: "PAYMENT", priority: "HIGH", entityType: "order" },
  PAYMENT_ACTION_REQUIRED: { category: "PAYMENT", priority: "HIGH", entityType: "order" },
  REFUND_STATUS_CHANGED: { category: "PAYMENT", priority: "HIGH", entityType: "order" },
  SHIPMENT_CREATED: { category: "SHIPPING", priority: "HIGH", entityType: "order" },
  TRACKING_UPDATED: { category: "SHIPPING", priority: "NORMAL", entityType: "order" },
  ORDER_DELIVERED: { category: "SHIPPING", priority: "HIGH", entityType: "order" },
  RETURN_REQUESTED: { category: "RETURN", priority: "HIGH", entityType: "return_request" },
  RETURN_STATUS_CHANGED: { category: "RETURN", priority: "HIGH", entityType: "return_request" },
  SUPPORT_REPLY: { category: "SUPPORT", priority: "HIGH", entityType: "support_thread" },
  QUESTION_ANSWERED: { category: "QUESTION_REVIEW", priority: "NORMAL", entityType: "product_question" },
  REVIEW_MODERATION_RESULT: { category: "QUESTION_REVIEW", priority: "NORMAL", entityType: "review" },
});
const entityTypes = new Set<string>([
  "order", "payment", "product", "product_question", "return_request", "review",
  "seller_application", "shipment", "store", "support_thread",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const API_ITEM_FIELDS = new Set([
  "id", "type", "category", "priority", "title", "message", "is_read", "read_at",
  "entity_type", "entity_id", "entity_key", "created_at", "updated_at",
]);
const TARGET_FIELDS = new Set(["entityType", "entityId", "entityKey", "entity_type", "entity_id", "entity_key"]);
const PUSH_FIELDS = new Set([
  "notificationId", "notification_id", "type", "category", "priority", "title", "body",
  "target", "entityType", "entityId", "entityKey", "entity_type", "entity_id", "entity_key",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function onlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function positiveInteger(value: unknown): number | null {
  const numeric = typeof value === "string" && /^[1-9]\d*$/u.test(value.trim())
    ? Number(value)
    : value;
  return typeof numeric === "number" && Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function dateString(value: unknown): string | null {
  const normalized = boundedString(value, 64);
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return null;
  return new Date(normalized).toISOString();
}

function aliased(source: Record<string, unknown>, camel: string, snake: string) {
  const camelPresent = Object.prototype.hasOwnProperty.call(source, camel);
  const snakePresent = Object.prototype.hasOwnProperty.call(source, snake);
  if (camelPresent && snakePresent && source[camel] !== source[snake]) return undefined;
  return camelPresent ? source[camel] : source[snake];
}

export function normalizeCustomerNotificationTarget(value: unknown): CustomerNotificationTarget | null {
  const source = record(value);
  if (!source || !onlyFields(source, TARGET_FIELDS)) return null;
  const entityType = String(aliased(source, "entityType", "entity_type") ?? "").trim().toLowerCase();
  if (!entityTypes.has(entityType)) return null;
  const rawId = aliased(source, "entityId", "entity_id");
  const rawKey = aliased(source, "entityKey", "entity_key");
  if (entityType === "seller_application") {
    const entityKey = boundedString(rawKey, 64)?.toLowerCase() ?? null;
    return entityKey && UUID_PATTERN.test(entityKey) && positiveInteger(rawId) === null
      ? Object.freeze({ entityType: "seller_application", entityKey })
      : null;
  }
  const entityId = positiveInteger(rawId);
  if (!entityId || (rawKey !== null && rawKey !== undefined && rawKey !== "")) return null;
  return Object.freeze({ entityType: entityType as CustomerNotificationEntityType, entityId });
}

export function normalizeCustomerNotification(value: unknown): CustomerNotification | null {
  const source = record(value);
  if (!source || !onlyFields(source, API_ITEM_FIELDS)) return null;
  const id = positiveInteger(source.id);
  const type = boundedString(source.type, 80)?.toUpperCase() ?? "";
  const category = boundedString(source.category, 40)?.toUpperCase() ?? "";
  const priority = boundedString(source.priority, 20)?.toUpperCase() ?? "";
  const title = boundedString(source.title, 120);
  const body = boundedString(source.message, 180);
  const createdAt = dateString(source.created_at);
  const updatedAt = dateString(source.updated_at);
  if (!id || !eventTypes.has(type) || !categories.has(category) || !priorities.has(priority) || !title || !body || !createdAt || !updatedAt) {
    return null;
  }
  const rawTarget = source.entity_type == null
    ? null
    : { entity_type: source.entity_type, entity_id: source.entity_id, entity_key: source.entity_key };
  const target = rawTarget ? normalizeCustomerNotificationTarget(rawTarget) : null;
  const rule = eventRules[type as CustomerNotificationEventType];
  if (!target || !rule || category !== rule.category || priority !== rule.priority || target.entityType !== rule.entityType) return null;
  const readAt = source.read_at == null ? null : dateString(source.read_at);
  if (source.read_at != null && !readAt) return null;
  return Object.freeze({
    id,
    type: type as CustomerNotificationEventType,
    category: category as CustomerNotificationCategory,
    priority: priority as CustomerNotificationPriority,
    title,
    body,
    isRead: source.is_read === true,
    readAt,
    createdAt,
    updatedAt,
    target,
  });
}

export function normalizeCustomerNotificationPage(value: unknown): CustomerNotificationPage {
  const source = record(value);
  if (!source || !onlyFields(source, new Set(["items", "page"])) || !Array.isArray(source.items)) {
    throw new Error("CUSTOMER_NOTIFICATION_PAGE_INVALID");
  }
  const rawItems = source.items;
  const items = rawItems.map(normalizeCustomerNotification).filter((item): item is CustomerNotification => item !== null);
  if (items.length !== rawItems.length) throw new Error("CUSTOMER_NOTIFICATION_ITEM_INVALID");
  const rawPage = record(source?.page);
  if (!rawPage || !onlyFields(rawPage, new Set(["limit", "hasMore", "nextCursor"]))) {
    throw new Error("CUSTOMER_NOTIFICATION_PAGE_INVALID");
  }
  const limit = positiveInteger(rawPage?.limit) ?? 50;
  const hasMore = rawPage?.hasMore === true;
  const nextCursor = hasMore ? boundedString(rawPage?.nextCursor, 1_024) : null;
  return Object.freeze({
    items: Object.freeze(items),
    page: Object.freeze({ limit, hasMore, nextCursor }),
  });
}

function parsedTarget(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value.trim() || value.length > 512) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function normalizeCustomerPushPayload(value: unknown): CustomerPushPayload | null {
  const source = record(value);
  if (!source || !onlyFields(source, PUSH_FIELDS)) return null;
  const notificationId = positiveInteger(aliased(source, "notificationId", "notification_id"));
  const type = boundedString(source.type, 80)?.toUpperCase() ?? "";
  const category = boundedString(source.category, 40)?.toUpperCase() ?? "";
  const priority = boundedString(source.priority, 20)?.toUpperCase() ?? "";
  const title = boundedString(source.title, 120);
  const body = boundedString(source.body, 180);
  if (!notificationId || !eventTypes.has(type) || !categories.has(category) || !priorities.has(priority) || !title || !body) return null;
  const targetSource = source.target === undefined
    ? {
        entityType: aliased(source, "entityType", "entity_type"),
        entityId: aliased(source, "entityId", "entity_id"),
        entityKey: aliased(source, "entityKey", "entity_key"),
      }
    : parsedTarget(source.target);
  const target = normalizeCustomerNotificationTarget(targetSource);
  const rule = eventRules[type as CustomerNotificationEventType];
  if (!target || !rule || category !== rule.category || priority !== rule.priority || target.entityType !== rule.entityType) return null;
  return Object.freeze({
    notificationId,
    type: type as CustomerNotificationEventType,
    category: category as CustomerNotificationCategory,
    priority: priority as CustomerNotificationPriority,
    title,
    body,
    target,
  });
}

const notificationCenter: CustomerNotificationDestination = Object.freeze({
  cal: "CAL-10", tab: "account", view: "notifications",
});

export function resolveCustomerNotificationDestination(target: CustomerNotificationTarget | null): CustomerNotificationDestination {
  if (!target) return notificationCenter;
  if (["order", "payment", "shipment"].includes(target.entityType)) {
    return Object.freeze({ cal: "CAL-09", tab: "account", view: "" });
  }
  if (target.entityType === "product" && target.entityId) {
    return Object.freeze({ cal: "CAL-06", tab: "home", view: "", productId: String(target.entityId) });
  }
  if (target.entityType === "return_request" && target.entityId) {
    return Object.freeze({ cal: "CAL-10", tab: "account", view: "returns", returnId: String(target.entityId) });
  }
  if (target.entityType === "product_question") {
    return Object.freeze({ cal: "CAL-10", tab: "account", view: "questions" });
  }
  if (target.entityType === "review") {
    return Object.freeze({ cal: "CAL-10", tab: "account", view: "reviews" });
  }
  if (target.entityType === "support_thread") {
    return Object.freeze({ cal: "CAL-11", tab: "support", view: "history" });
  }
  return notificationCenter;
}

export const CUSTOMER_NOTIFICATION_CENTER_DESTINATION = notificationCenter;
