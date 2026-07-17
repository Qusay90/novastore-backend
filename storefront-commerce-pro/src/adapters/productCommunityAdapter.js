const asArray = (value) => Array.isArray(value) ? value : [];

const positiveInteger = (value, label = "Ürün") => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} kimliği geçerli olmalıdır.`);
  }
  return normalized;
};

const safeMediaUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
};

const normalizeReviewMedia = (media) => asArray(media).map((item) => {
  const url = safeMediaUrl(item?.media_url || item?.mediaUrl || item?.url);
  if (!url) return null;
  const declaredType = String(item?.media_type || item?.mediaType || "").toLowerCase();
  const type = declaredType === "video" ? "video" : "image";
  return Object.freeze({
    id: Number(item?.id) || null,
    url,
    type,
    sortOrder: Number(item?.sort_order ?? item?.sortOrder ?? 0),
  });
}).filter(Boolean).sort((left, right) => left.sortOrder - right.sortOrder);

const normalizeReview = (review) => Object.freeze({
  id: positiveInteger(review?.id, "Yorum"),
  rating: Math.min(5, Math.max(1, Number(review?.rating) || 1)),
  comment: String(review?.comment || "").trim(),
  customerName: String(review?.full_name || review?.fullName || "NovaStore müşterisi").trim(),
  createdAt: String(review?.created_at || review?.createdAt || "").trim(),
  media: Object.freeze(normalizeReviewMedia(review?.media)),
});

const normalizePermission = (permission) => Object.freeze({
  canReview: permission?.canReview === true,
  requiresAuth: permission?.requiresAuth === true,
  code: String(permission?.code || "UNKNOWN").trim().toUpperCase(),
  message: String(permission?.message || "").trim(),
});

const normalizeQuestion = (question) => Object.freeze({
  id: positiveInteger(question?.id, "Soru"),
  question: String(question?.question || "").trim(),
  answer: String(question?.answer || "").trim(),
  customerName: String(question?.user_name || question?.userName || "NovaStore müşterisi").trim(),
  createdAt: String(question?.created_at || question?.createdAt || "").trim(),
  answeredAt: String(question?.answered_at || question?.answeredAt || "").trim(),
  status: question?.is_answered === true || String(question?.status || "") === "answered" || Boolean(question?.answer)
    ? "answered"
    : "pending",
});

const normalizeSafely = (normalizer, value) => {
  try {
    return normalizer(value);
  } catch {
    return null;
  }
};

const normalizeCommunity = (reviewPayload, questionPayload, warnings = []) => {
  const reviews = asArray(reviewPayload?.reviews)
    .map((review) => normalizeSafely(normalizeReview, review))
    .filter(Boolean);
  const questions = asArray(questionPayload)
    .map((question) => normalizeSafely(normalizeQuestion, question))
    .filter(Boolean);
  const average = Number(reviewPayload?.average);
  const totalReviews = Number(reviewPayload?.totalReviews);
  return Object.freeze({
    reviews: Object.freeze(reviews),
    average: Number.isFinite(average) ? Math.min(5, Math.max(0, average)) : 0,
    totalReviews: Number.isInteger(totalReviews) && totalReviews >= 0 ? totalReviews : reviews.length,
    permission: normalizePermission(reviewPayload?.reviewPermission),
    questions: Object.freeze(questions),
    warnings: Object.freeze(warnings),
  });
};

export function createProductCommunityAdapter({ http } = {}) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("Ürün topluluk adapterı müşteri HTTP istemcisi gerektirir.");
  }

  const load = async (productId, { signal } = {}) => {
    const id = positiveInteger(productId);
    const [reviews, questions] = await Promise.allSettled([
      http.request(`/api/reviews/product/${id}`, { signal }),
      http.request(`/api/questions/product/${id}`, { signal }),
    ]);
    if (reviews.status === "rejected" && questions.status === "rejected") {
      throw reviews.reason || questions.reason || new Error("Ürün değerlendirmeleri yüklenemedi.");
    }
    const warnings = [];
    if (reviews.status === "rejected") warnings.push("Değerlendirmeler şu anda alınamıyor.");
    if (questions.status === "rejected") warnings.push("Ürün soruları şu anda alınamıyor.");
    return normalizeCommunity(
      reviews.status === "fulfilled" ? reviews.value : {},
      questions.status === "fulfilled" ? questions.value : [],
      warnings,
    );
  };

  const addReview = async (productId, { rating, comment = "" } = {}) => {
    const id = positiveInteger(productId);
    const normalizedRating = Number(rating);
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      throw new TypeError("Değerlendirme puanı 1 ile 5 arasında olmalıdır.");
    }
    const normalizedComment = String(comment || "").trim();
    if (normalizedComment.length > 2000) {
      throw new TypeError("Yorum en fazla 2000 karakter olabilir.");
    }
    return http.request("/api/reviews", {
      method: "POST",
      body: { productId: id, rating: normalizedRating, comment: normalizedComment || null },
    });
  };

  const askQuestion = async (productId, question) => {
    const id = positiveInteger(productId);
    const normalizedQuestion = String(question || "").trim();
    if (normalizedQuestion.length < 5 || normalizedQuestion.length > 1000) {
      throw new TypeError("Soru 5 ile 1000 karakter arasında olmalıdır.");
    }
    return http.request("/api/questions/ask", {
      method: "POST",
      body: { product_id: id, question: normalizedQuestion },
    });
  };

  return Object.freeze({ load, addReview, askQuestion });
}

export const productCommunityAdapterTestUtils = Object.freeze({
  safeMediaUrl,
  normalizeReviewMedia,
  normalizeReview,
  normalizePermission,
  normalizeQuestion,
  normalizeSafely,
  normalizeCommunity,
});
