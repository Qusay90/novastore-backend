import { XCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function CheckoutCancel() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2A43] to-[#1E4E79] flex items-center justify-center py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="mb-6"
        >
          <XCircle size={80} className="mx-auto text-red-500" />
        </motion.div>

        <h1 className="text-3xl font-bold text-[#0F2A43] mb-3">Ödeme İptal Edildi</h1>

        <p className="text-[#0F2A43]/60 mb-6">
          Ödeme işlemi iptal edilmiştir. Sepetiniz korunmuştur.
        </p>

        <div className="space-y-3">
          <Link href="/cart">
            <Button className="w-full bg-[#F7941D] text-white font-semibold py-3 rounded-xl">
              Sepete Geri Dön
            </Button>
          </Link>

          <Link href="/">
            <Button variant="outline" className="w-full border-[#0F2A43]/20 text-[#0F2A43]">
              <ArrowLeft size={18} className="mr-2" />
              Ana Sayfaya Dön
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
