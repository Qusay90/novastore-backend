export interface CustomerSession {
  authenticated: boolean;
  userId: number | null;
  name: string;
}

export function readCustomerSession(): CustomerSession {
  const token = localStorage.getItem("nova_user_token") || "";
  try {
    const user = JSON.parse(localStorage.getItem("nova_user_info") || "null") as Record<string, unknown> | null;
    const userId = Number(user?.id);
    return {
      authenticated: Boolean(token) && Number.isInteger(userId) && userId > 0,
      userId: Number.isInteger(userId) && userId > 0 ? userId : null,
      name: String(user?.name || user?.email || ""),
    };
  } catch {
    return { authenticated: false, userId: null, name: "" };
  }
}
