const record = (value, field) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${field} nesne olmalıdır.`);
  return value;
};

const array = (value, field) => {
  if (!Array.isArray(value)) throw new TypeError(`${field} dizi olmalıdır.`);
  return value;
};

const id = (value, field) => {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1) throw new TypeError(`${field} geçersiz.`);
  return numeric;
};

const text = (value, field, { nullable = false, max = 10000 } = {}) => {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new TypeError(`${field} geçersiz metin içeriyor.`);
  return value;
};

const date = (value, field, { nullable = true } = {}) => {
  if (nullable && (value === null || value === undefined)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${field} geçersiz tarih içeriyor.`);
  return parsed;
};

const number = (value, field, { nullable = false } = {}) => {
  if (nullable && (value === null || value === undefined)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${field} geçersiz sayı içeriyor.`);
  return parsed;
};

const boolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} boolean olmalıdır.`);
  return value;
};

const reviewStatuses = new Set(["PENDING", "PUBLISHED", "HIDDEN"]);
const normalizeReview = (raw, index) => {
  const value = record(raw, `reviews[${index}]`);
  const status = text(value.status, `reviews[${index}].status`, { max: 20 });
  if (!reviewStatuses.has(status)) throw new TypeError(`reviews[${index}].status desteklenmiyor.`);
  return Object.freeze({
    id: id(value.id, `reviews[${index}].id`),
    productId: id(value.product_id, `reviews[${index}].product_id`),
    productName: text(value.product_name, `reviews[${index}].product_name`, { max: 255 }),
    userId: id(value.user_id, `reviews[${index}].user_id`),
    userName: text(value.user_name, `reviews[${index}].user_name`, { max: 255 }),
    rating: number(value.rating, `reviews[${index}].rating`),
    comment: text(value.comment, `reviews[${index}].comment`, { nullable: true, max: 2000 }),
    status,
    revision: id(value.revision, `reviews[${index}].revision`),
    createdAt: date(value.created_at, `reviews[${index}].created_at`, { nullable: false }),
    moderatedBy: value.moderated_by == null ? null : id(value.moderated_by, `reviews[${index}].moderated_by`),
    moderatedAt: date(value.moderated_at, `reviews[${index}].moderated_at`),
    moderationNote: text(value.moderation_note, `reviews[${index}].moderation_note`, { nullable: true, max: 1000 }),
  });
};

export const normalizeReviewPage = (payload) => {
  const value = record(payload, "review yanıtı");
  const items = array(value.reviews, "reviews").map(normalizeReview);
  if (Number(value.count) !== items.length) throw new TypeError("review count tutarsız.");
  return Object.freeze({ items: Object.freeze(items), count: items.length });
};

export const normalizeQuestions = (payload) => Object.freeze(array(payload, "question yanıtı").map((raw, index) => {
  const value = record(raw, `questions[${index}]`);
  return Object.freeze({
    id: id(value.id, `questions[${index}].id`),
    productId: id(value.product_id, `questions[${index}].product_id`),
    productName: text(value.product_name, `questions[${index}].product_name`, { max: 255 }),
    userName: text(value.user_name, `questions[${index}].user_name`, { max: 255 }),
    question: text(value.question, `questions[${index}].question`, { max: 2000 }),
    answer: text(value.answer, `questions[${index}].answer`, { nullable: true, max: 2000 }),
    revision: id(value.revision, `questions[${index}].revision`),
    createdAt: date(value.created_at, `questions[${index}].created_at`, { nullable: false }),
    answeredAt: date(value.answered_at, `questions[${index}].answered_at`),
  });
}));

const couponStatuses = new Set(["disabled", "scheduled", "expired", "exhausted", "active"]);
const normalizeCoupon = (raw, index) => {
  const value = record(raw, `coupons[${index}]`);
  const operationalStatus = text(value.operational_status, `coupons[${index}].operational_status`, { max: 20 });
  if (!couponStatuses.has(operationalStatus)) throw new TypeError(`coupons[${index}].operational_status desteklenmiyor.`);
  return Object.freeze({
    id: id(value.id, `coupons[${index}].id`),
    code: text(value.code, `coupons[${index}].code`, { max: 64 }),
    discountType: text(value.discount_type, `coupons[${index}].discount_type`, { max: 20 }),
    discountValue: number(value.discount_value, `coupons[${index}].discount_value`),
    minOrderAmount: number(value.min_order_amount, `coupons[${index}].min_order_amount`),
    maxDiscountAmount: number(value.max_discount_amount, `coupons[${index}].max_discount_amount`, { nullable: true }),
    usageLimit: value.usage_limit == null ? null : id(value.usage_limit, `coupons[${index}].usage_limit`),
    usedCount: Number(value.used_count || 0),
    active: boolean(value.is_active, `coupons[${index}].is_active`),
    startsAt: date(value.starts_at, `coupons[${index}].starts_at`),
    endsAt: date(value.ends_at, `coupons[${index}].ends_at`),
    revision: id(value.revision, `coupons[${index}].revision`),
    operationalStatus,
    createdAt: date(value.created_at, `coupons[${index}].created_at`, { nullable: false }),
    updatedAt: date(value.updated_at, `coupons[${index}].updated_at`),
  });
};

export const normalizeCoupons = (payload) => {
  const value = record(payload, "coupon yanıtı");
  return Object.freeze(array(value.items, "coupon items").map(normalizeCoupon));
};

export const normalizeSupportThreads = (payload) => Object.freeze(array(payload, "support users").map((raw, index) => {
  const value = record(raw, `support[${index}]`);
  const status = text(value.status || "OPEN", `support[${index}].status`, { max: 20 });
  if (!["OPEN", "TAKEN_OVER", "CLOSED"].includes(status)) throw new TypeError(`support[${index}].status desteklenmiyor.`);
  return Object.freeze({
    customerId: id(value.id, `support[${index}].id`),
    threadId: id(value.support_thread_id, `support[${index}].support_thread_id`),
    name: text(value.name, `support[${index}].name`, { max: 255 }),
    email: text(value.email, `support[${index}].email`, { max: 320 }),
    status,
    assignedAdminId: value.assigned_admin_id == null ? null : id(value.assigned_admin_id, `support[${index}].assigned_admin_id`),
    source: text(value.source || "customer", `support[${index}].source`, { max: 40 }),
    lastMessageAt: date(value.last_message_at, `support[${index}].last_message_at`),
    handoffCount: Number(value.ai_handoff_count || 0),
  });
}));

export const normalizeSupportMessages = (payload) => Object.freeze(array(payload, "support history").map((raw, index) => {
  const value = record(raw, `messages[${index}]`);
  return Object.freeze({
    id: id(value.id, `messages[${index}].id`),
    senderId: id(value.sender_id, `messages[${index}].sender_id`),
    receiverId: id(value.receiver_id, `messages[${index}].receiver_id`),
    threadId: id(value.support_thread_id, `messages[${index}].support_thread_id`),
    message: text(value.message, `messages[${index}].message`, { max: 2000 }),
    createdAt: date(value.created_at, `messages[${index}].created_at`, { nullable: false }),
    aiHandoff: value.is_ai_handoff === true,
  });
}));
