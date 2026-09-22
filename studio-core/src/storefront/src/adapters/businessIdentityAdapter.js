const PUBLIC_IDENTITY_FIELDS = Object.freeze([
  "legalCompanyName",
  "tradeName",
  "taxNumber",
  "mersisNumber",
  "registeredAddress",
  "kepAddress",
  "phone",
  "email",
  "customerDomain",
]);
const OPTIONAL_PUBLIC_IDENTITY_FIELDS = Object.freeze(["taxOffice"]);

const pendingProjection = () => Object.freeze({
  status: "pending_owner_company_formation",
  identity: null,
});

const normalizeIdentity = (payload) => {
  if (payload?.status !== "configured" || !payload.identity || typeof payload.identity !== "object") {
    return pendingProjection();
  }
  const identity = Object.fromEntries(PUBLIC_IDENTITY_FIELDS.map((field) => [
    field,
    String(payload.identity[field] || "").trim(),
  ]));
  if (Object.values(identity).some((value) => !value)) return pendingProjection();
  for (const field of OPTIONAL_PUBLIC_IDENTITY_FIELDS) {
    const value = String(payload.identity[field] || "").trim();
    if (value) identity[field] = value;
  }
  return Object.freeze({ status: "configured", identity: Object.freeze(identity) });
};

export function createBusinessIdentityAdapter(http) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("İşletme kimliği adapter HTTP istemcisi gerektirir.");
  }
  return Object.freeze({
    load: async ({ signal } = {}) => normalizeIdentity(
      await http.request("/api/business-identity", { signal }),
    ),
  });
}

export const businessIdentityAdapterTestUtils = Object.freeze({
  PUBLIC_IDENTITY_FIELDS,
  OPTIONAL_PUBLIC_IDENTITY_FIELDS,
  normalizeIdentity,
  pendingProjection,
});
