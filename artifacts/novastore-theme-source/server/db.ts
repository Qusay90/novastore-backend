import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, orders, cartItems } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

// Update user Stripe customer ID
export async function updateUserStripeCustomerId(userId: number, stripeCustomerId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user: database not available");
    return;
  }

  try {
    await db.update(users).set({ stripeCustomerId }).where(eq(users.id, userId));
  } catch (error) {
    console.error("[Database] Failed to update user Stripe ID:", error);
    throw error;
  }
}

// Create order
export async function createOrder(order: any): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.insert(orders).values(order);
    // Get the last inserted order ID
    const lastOrder = await db.select().from(orders).orderBy((t) => t.id).limit(1);
    return lastOrder[0]?.id || 0;
  } catch (error) {
    console.error("[Database] Failed to create order:", error);
    throw error;
  }
}

// Update order status
export async function updateOrderStatus(
  orderId: number,
  status: "pending" | "completed" | "failed" | "cancelled"
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.update(orders).set({ status }).where(eq(orders.id, orderId));
  } catch (error) {
    console.error("[Database] Failed to update order status:", error);
    throw error;
  }
}

// Add to cart
export async function addToCart(item: any): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.insert(cartItems).values(item);
  } catch (error) {
    console.error("[Database] Failed to add to cart:", error);
    throw error;
  }
}

// Get cart
export async function getCart(userId: number) {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    return await db.select().from(cartItems).where(eq(cartItems.userId, userId));
  } catch (error) {
    console.error("[Database] Failed to get cart:", error);
    return [];
  }
}

// Clear cart
export async function clearCart(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  } catch (error) {
    console.error("[Database] Failed to clear cart:", error);
    throw error;
  }
}
