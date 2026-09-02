import React from "react";
import ReactDOM from "react-dom/client";
import { CustomerAccountRuntime, useCustomerAccountRuntime } from "../src/account";
import { useCustomerStoreFollowRuntime } from "../src/account/useCustomerStoreFollowRuntime";
import { initializeCustomerSession } from "../src/auth/customerSession";
import { CustomerNotificationRuntime, useCustomerNotificationRuntime } from "../src/notifications";

type AccountRuntime = NonNullable<ReturnType<typeof useCustomerAccountRuntime>>;

function actionFailure(error: unknown) {
  if (!error || typeof error !== "object") return "error";
  const code = "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";
  return `error:${code}`;
}

function StoreFollowProbe({
  account,
  storeSlug,
  enabled,
}: Readonly<{ account: AccountRuntime; storeSlug: string; enabled: boolean }>) {
  const follow = useCustomerStoreFollowRuntime({
    storeSlug,
    enabled,
    accountPhase: account.phase,
    customerId: account.user?.id ?? null,
    refreshFollowedStores: account.refreshFollowedStores,
  });
  const [lastMutationResult, setLastMutationResult] = React.useState("idle");

  const mutate = (nextFollowing: boolean) => {
    setLastMutationResult("pending");
    void follow.setFollowing(nextFollowing)
      .then((confirmed) => setLastMutationResult(confirmed ? "confirmed" : "rejected"));
  };

  return (
    <section
      data-testid="store-follow-probe"
      data-phase={follow.phase}
      data-confirmed={String(follow.confirmed)}
      data-following={String(follow.following)}
      data-busy={String(follow.busy)}
    >
      <span data-testid="store-follow-slug">{storeSlug}</span>
      <span data-testid="store-follow-count">{follow.followerCount}</span>
      <span data-testid="store-follow-error" role="alert">{follow.errorMessage}</span>
      <span data-testid="store-follow-mutation-result">{lastMutationResult}</span>
      <button type="button" onClick={() => mutate(true)}>Mağazayı takip et</button>
      <button type="button" onClick={() => mutate(false)}>Mağaza takibini bırak</button>
      <button type="button" onClick={follow.refresh}>Takip durumunu yenile</button>
    </section>
  );
}

function RuntimeProbe() {
  const account = useCustomerAccountRuntime();
  const notifications = useCustomerNotificationRuntime();
  const [loginAResult, setLoginAResult] = React.useState("idle");
  const [loginBResult, setLoginBResult] = React.useState("idle");
  const [followProbeMounted, setFollowProbeMounted] = React.useState(false);
  const [followProbeEnabled, setFollowProbeEnabled] = React.useState(true);
  const [followStoreSlug, setFollowStoreSlug] = React.useState("nova-audio");
  const [favoriteMutationResult, setFavoriteMutationResult] = React.useState("idle");
  const [passwordMutationResult, setPasswordMutationResult] = React.useState("idle");
  const [questionMutationResult, setQuestionMutationResult] = React.useState("idle");
  const [reviewMutationResult, setReviewMutationResult] = React.useState("idle");
  if (!account || !notifications) return null;

  const login = (customer: "a" | "b") => {
    const setResult = customer === "a" ? setLoginAResult : setLoginBResult;
    setResult("pending");
    void account.login(`customer-${customer}@example.test`, "customer-password")
      .then(() => setResult("success"))
      .catch(() => setResult("error"));
  };

  const runAction = (
    setResult: React.Dispatch<React.SetStateAction<string>>,
    action: () => Promise<void>,
  ) => {
    setResult("pending");
    void action()
      .then(() => setResult("success"))
      .catch((error: unknown) => setResult(actionFailure(error)));
  };

  return (
    <main
      data-testid="runtime-probe"
      data-account-phase={account.phase}
      data-notification-phase={notifications.phase}
      data-session-available={String(notifications.sessionAvailable)}
    >
      <span data-testid="customer-id">{account.user?.id ?? "guest"}</span>
      <span data-testid="address-count">{account.addresses.length}</span>
      <span data-testid="order-count">{account.orders.length}</span>
      <span data-testid="support-count">{account.supportMessages.length}</span>
      <span data-testid="coupon-count">{account.coupons.length}</span>
      <span data-testid="question-count">{account.questions.length}</span>
      <span data-testid="review-count">{account.reviews.length}</span>
      <span data-testid="followed-store-count">{account.followedStores.length}</span>
      <span data-testid="favorite-count">{account.favoriteProductIds.length}</span>
      <span data-testid="favorite-product-ids">{account.favoriteProductIds.join(",")}</span>
      <span data-testid="account-parity-data">{[
        ...account.coupons.map((item) => item.code),
        ...account.questions.map((item) => item.question),
        ...account.reviews.map((item) => item.comment || ""),
        ...account.followedStores.map((item) => item.name),
      ].join(" | ")}</span>
      <span data-testid="notification-count">{notifications.items.length}</span>
      <div data-testid="notification-titles">{notifications.items.map((item) => <span key={item.id}>{item.title}</span>)}</div>
      <button type="button" onClick={() => void account.refresh()}>Hesabı doğrula</button>
      <button type="button" onClick={() => void account.logout()}>Çıkış yap</button>
      <button type="button" onClick={() => login("a")}>Customer A girişi</button>
      <button type="button" onClick={() => login("b")}>Customer B girişi</button>
      <button type="button" onClick={() => setFollowProbeMounted((current) => !current)}>Takip bileşenini aç/kapat</button>
      <button type="button" onClick={() => setFollowProbeEnabled((current) => !current)}>Canlı/önizleme değiştir</button>
      <button type="button" onClick={() => setFollowStoreSlug((current) => current === "nova-audio" ? "nova-teknoloji" : "nova-audio")}>Mağaza rotasını değiştir</button>
      <button type="button" onClick={() => runAction(setFavoriteMutationResult, () => account.setFavoriteProduct(71, true))}>Ürün 71 favoriye ekle</button>
      <button type="button" onClick={() => runAction(setFavoriteMutationResult, () => account.setFavoriteProduct(71, false))}>Ürün 71 favoriden çıkar</button>
      <button type="button" onClick={() => runAction(setFavoriteMutationResult, account.refreshFavoriteProductIds)}>Favorileri yenile</button>
      <button type="button" onClick={() => runAction(setPasswordMutationResult, () => account.changePassword("CurrentPass9", "FreshPass10"))}>Geçerli şifre değişikliği</button>
      <button type="button" onClick={() => runAction(setPasswordMutationResult, () => account.changePassword("CurrentPass9", "short"))}>Geçersiz şifre değişikliği</button>
      <button type="button" onClick={() => runAction(setQuestionMutationResult, () => account.submitProductQuestion(71, "Kargo ne zaman teslim edilir?"))}>Ürün sorusu gönder</button>
      <button type="button" onClick={() => runAction(setQuestionMutationResult, () => account.submitProductQuestion(71, "x"))}>Geçersiz ürün sorusu gönder</button>
      <button type="button" onClick={() => runAction(setReviewMutationResult, () => account.submitProductReview(71, 5, "Ürün beklentimi karşıladı."))}>Ürün değerlendirmesi gönder</button>
      <button type="button" onClick={() => runAction(setReviewMutationResult, () => account.submitProductReview(71, 6, "Geçersiz puan."))}>Geçersiz ürün değerlendirmesi gönder</button>
      <span data-testid="login-a-result">{loginAResult}</span>
      <span data-testid="login-b-result">{loginBResult}</span>
      <span data-testid="follow-probe-mounted">{String(followProbeMounted)}</span>
      <span data-testid="follow-probe-enabled">{String(followProbeEnabled)}</span>
      <span data-testid="favorite-mutation-result">{favoriteMutationResult}</span>
      <span data-testid="password-mutation-result">{passwordMutationResult}</span>
      <span data-testid="question-mutation-result">{questionMutationResult}</span>
      <span data-testid="review-mutation-result">{reviewMutationResult}</span>
      {followProbeMounted && <StoreFollowProbe account={account} storeSlug={followStoreSlug} enabled={followProbeEnabled} />}
    </main>
  );
}

async function bootstrapFixture() {
  await initializeCustomerSession();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <CustomerNotificationRuntime>
        <CustomerAccountRuntime>
          <RuntimeProbe />
        </CustomerAccountRuntime>
      </CustomerNotificationRuntime>
    </React.StrictMode>,
  );
}

void bootstrapFixture();
