import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import Stripe from "stripe";
type StripeClient = InstanceType<typeof Stripe>;
import { createOrder, updateUserStripeCustomerId, getCart, clearCart } from "../db";
import { STRIPE_PRODUCTS } from "@shared/stripe-products";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export const stripeRouter = router({
  // Checkout session oluştur
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            productId: z.number(),
            quantity: z.number().min(1),
          })
        ),
        origin: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const user = ctx.user;
        if (!user) {
          throw new Error("User not authenticated");
        }

        // Stripe müşteri ID'sini kontrol et veya oluştur
        let stripeCustomerId = user.stripeCustomerId;
        if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          name: user.name ?? undefined,
            metadata: {
              userId: user.id.toString(),
            },
          });
          stripeCustomerId = customer.id;
          await updateUserStripeCustomerId(user.id, stripeCustomerId);
        }

        // Line items oluştur
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = input.items.map(
          (item) => {
            const product = STRIPE_PRODUCTS.find((p) => p.id === item.productId.toString());
            if (!product) {
              throw new Error(`Product ${item.productId} not found`);
            }

            return {
              price_data: {
                currency: product.currency.toLowerCase(),
                product_data: {
                  name: product.name,
                  description: product.description,
                },
                unit_amount: product.priceInCents,
              },
              quantity: item.quantity,
            };
          }
        );

        // Checkout session oluştur
        const session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          payment_method_types: ["card"],
          line_items: lineItems,
          mode: "payment",
          success_url: `${input.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${input.origin}/checkout/cancel`,
          client_reference_id: user.id.toString(),
          metadata: {
            userId: user.id.toString(),
            customerEmail: user.email || "",
            customerName: user.name || "",
          },
          allow_promotion_codes: true,
        });

        return {
          sessionId: session.id,
          url: session.url,
        };
      } catch (error) {
        console.error("[Stripe] Error creating checkout session:", error);
        throw error;
      }
    }),

  // Sepeti getir
  getCart: protectedProcedure.query(async ({ ctx }) => {
    const cartItems = await getCart(ctx.user!.id);
    return cartItems.map((item) => {
      const product = STRIPE_PRODUCTS.find((p) => p.id === item.productId.toString());
      return {
        ...item,
        productName: product?.name || "Unknown",
        totalPrice: item.price * item.quantity,
      };
    });
  }),

  // Sepete ürün ekle
  addToCart: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        quantity: z.number().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const product = STRIPE_PRODUCTS.find((p) => p.id === input.productId.toString());
      if (!product) {
        throw new Error("Product not found");
      }

      await createOrder({
        userId: ctx.user!.id,
        totalAmount: product.priceInCents * input.quantity,
        currency: product.currency,
        status: "pending",
        items: JSON.stringify([
          {
            productId: input.productId,
            quantity: input.quantity,
            name: product.name,
            price: product.priceInCents,
          },
        ]),
      });

      return { success: true };
    }),

  // Sepeti temizle
  clearCart: protectedProcedure.mutation(async ({ ctx }) => {
    await clearCart(ctx.user!.id);
    return { success: true };
  }),
});
