import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, ShoppingCart, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, totalPrice } = useCart();
  const { user } = useAuth();
  const createCheckoutMutation = trpc.stripe.createCheckoutSession.useMutation();

  const handleCheckout = async () => {
    if (!user) {
      toast.error("Lütfen giriş yapın");
      return;
    }

    if (items.length === 0) {
      toast.error("Sepetiniz boş");
      return;
    }

    try {
      const result = await createCheckoutMutation.mutateAsync({
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        origin: window.location.origin,
      });

      if (result.url) {
        window.open(result.url, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Ödeme sayfasına yönlendirilirken hata oluştu");
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <div className="container mx-auto py-20 text-center">
          <ShoppingCart size={64} className="mx-auto text-[#0F2A43]/20 mb-6" />
          <h1 className="text-3xl font-bold text-[#0F2A43] mb-4">Sepetiniz Boş</h1>
          <p className="text-[#0F2A43]/60 mb-8">Alışverişe başlamak için ürünleri keşfedin</p>
          <Link href="/">
            <Button className="bg-gradient-to-r from-[#0F2A43] to-[#1E4E79] text-white">
              <ArrowLeft size={18} className="mr-2" />
              Ana Sayfaya Dön
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] py-12">
      <div className="container mx-auto">
        <h1 className="text-4xl font-bold text-[#0F2A43] mb-8">Alışveriş Sepeti</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sepet Ürünleri */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              {items.map((item, index) => (
                <motion.div
                  key={item.productId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-4 py-6 border-b border-[#0F2A43]/10 last:border-b-0"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-[#0F2A43] text-lg">{item.name}</h3>
                    <p className="text-[#F7941D] font-bold text-lg">
                      {(item.price / 100).toLocaleString("tr-TR")} ₺
                    </p>
                  </div>

                  {/* Miktar Kontrolleri */}
                  <div className="flex items-center gap-2 bg-[#F5F7FA] rounded-lg p-2">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="p-1 hover:bg-[#0F2A43]/10 rounded transition-colors"
                    >
                      <Minus size={18} className="text-[#0F2A43]" />
                    </button>
                    <span className="w-8 text-center font-semibold text-[#0F2A43]">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="p-1 hover:bg-[#0F2A43]/10 rounded transition-colors"
                    >
                      <Plus size={18} className="text-[#0F2A43]" />
                    </button>
                  </div>

                  {/* Toplam Fiyat */}
                  <div className="text-right min-w-[100px]">
                    <p className="text-[#0F2A43]/60 text-sm">Toplam</p>
                    <p className="font-bold text-[#0F2A43] text-lg">
                      {((item.price * item.quantity) / 100).toLocaleString("tr-TR")} ₺
                    </p>
                  </div>

                  {/* Sil Butonu */}
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={20} />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Özet */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-6">
              <h2 className="text-xl font-bold text-[#0F2A43] mb-6">Sipariş Özeti</h2>

              <div className="space-y-4 mb-6 pb-6 border-b border-[#0F2A43]/10">
                <div className="flex justify-between text-[#0F2A43]/60">
                  <span>Ara Toplam</span>
                  <span>{(totalPrice / 100).toLocaleString("tr-TR")} ₺</span>
                </div>
                <div className="flex justify-between text-[#0F2A43]/60">
                  <span>Kargo</span>
                  <span>Ücretsiz</span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-semibold text-[#0F2A43]">Toplam</span>
                <span className="text-2xl font-bold text-[#F7941D]">
                  {(totalPrice / 100).toLocaleString("tr-TR")} ₺
                </span>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={createCheckoutMutation.isPending}
                className="w-full bg-gradient-to-r from-[#0F2A43] to-[#1E4E79] text-white font-semibold py-3 rounded-xl hover:shadow-lg transition-all mb-3"
              >
                {createCheckoutMutation.isPending ? "Yükleniyor..." : "Ödemeye Geç"}
              </Button>

              <Button
                variant="outline"
                onClick={() => clearCart()}
                className="w-full border-[#0F2A43]/20 text-[#0F2A43] hover:bg-[#F5F7FA]"
              >
                Sepeti Temizle
              </Button>

              <Link href="/">
                <Button
                  variant="ghost"
                  className="w-full mt-3 text-[#1E4E79] hover:text-[#F7941D]"
                >
                  Alışverişe Devam Et
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
