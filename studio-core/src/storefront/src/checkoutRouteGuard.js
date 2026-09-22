export function isCheckoutReviewBlocked(step, canEnterReview) {
  return step === "review" && canEnterReview !== true;
}

export function resolveCheckoutVisibleStep(step, canEnterReview) {
  return isCheckoutReviewBlocked(step, canEnterReview) ? "payment" : step;
}
