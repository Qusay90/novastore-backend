const INTEGRATED_ADMIN_PAGES = Object.freeze([
  "dashboard",
  "orders",
  "returns",
  "notifications",
  "catalog",
  "catalogStructure",
  "sellerApplications",
  "reviews",
  "questions",
  "coupons",
  "support",
]);

export const resolveIntegratedAdminPage = (hash = "") => {
  const candidate = String(hash)
    .replace(/^#\/?/, "")
    .split(/[?&]/, 1)[0];
  return INTEGRATED_ADMIN_PAGES.includes(candidate) ? candidate : "dashboard";
};

export const integratedAdminPageHash = (page) => (
  `#/${INTEGRATED_ADMIN_PAGES.includes(page) ? page : "dashboard"}`
);
