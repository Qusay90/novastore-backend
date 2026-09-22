const readLocalUser = (storage) => {
  try {
    const user = JSON.parse(storage?.getItem?.("nova_user_info") || "null");
    return user && typeof user === "object" ? user : null;
  } catch {
    return null;
  }
};

const normalizeUser = (user) => user ? Object.freeze({
  id: Number(user.id),
  fullName: String(user.fullName || user.full_name || user.name || "").trim(),
  email: String(user.email || "").trim(),
  phone: user.phone ? String(user.phone) : null,
  role: String(user.role || "customer").trim(),
}) : null;

export function createAuthAdapter({
  http,
  storage = globalThis.localStorage,
  location = globalThis.location,
} = {}) {
  if (!http || typeof http.request !== "function") throw new TypeError("Auth adapter HTTP istemcisi gerektirir.");

  const load = async ({ signal } = {}) => {
    const token = String(storage?.getItem?.("nova_user_token") || "");
    const localUser = normalizeUser(readLocalUser(storage));
    if (!token || !localUser?.id) {
      return Object.freeze({ status: "guest", user: null, warning: null });
    }
    try {
      const payload = await http.request("/api/users/me", { signal, authenticated: true });
      const user = normalizeUser(payload?.user || payload);
      if (!user?.id) throw new Error("Doğrulanmış müşteri yanıtında kullanıcı kimliği bulunamadı.");
      if (user) storage?.setItem?.("nova_user_info", JSON.stringify(user));
      return Object.freeze({ status: "authenticated", user, warning: null });
    } catch (error) {
      if (error?.status === 401) {
        return Object.freeze({ status: "guest", user: null, warning: error });
      }
      return Object.freeze({ status: "unverified", user: localUser, warning: error });
    }
  };

  const openAccount = (session) => {
    const authenticated = session?.status === "authenticated" || session?.status === "unverified";
    location?.assign?.(authenticated ? "#/hesabim" : "#/giris");
  };

  return Object.freeze({ load, openAccount });
}

export const authAdapterTestUtils = Object.freeze({ readLocalUser, normalizeUser });
