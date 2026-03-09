import { CheckCircle, ArrowRight } from "lucide-react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function CheckoutSuccess() {
  const sessionId = useSearch().split("=")[1];

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
          <CheckCircle size={80} className="mx-auto text-[#F7941D]" />
        </motion.div>

        <h1 className="text-3xl font-bold text-[#0F2A43] mb-3">Ödeme Başarılı!</h1>

        <p className="text-[#0F2A43]/60 mb-2">
          Siparişiniz başarıyla alınmıştır. Kargo takip numaranız e-posta adresinize gönderilecektir.
        </p>

        {sessionId && (
          <p className="text-xs text-[#0F2A43]/40 mb-6 font-mono bg-[#F5F7FA] p-3 rounded-lg">
            Session ID: {sessionId}
          </p>
        )}

        <div className="space-y-3">
          <Link href="/">
            <Button className="w-full bg-gradient-to-r from-[#0F2A43] to-[#1E4E79] text-white font-semibold py-3 rounded-xl hover:shadow-lg transition-all">
              Ana Sayfaya Dön
              <ArrowRight size={18} className="ml-2" />
            </Button>
          </Link>

          <Link href="/orders">
            <Button
              variant="outline"
              className="w-full border-[#0F2A43]/20 text-[#0F2A43] hover:bg-[#F5F7FA]"
            >
              Siparişlerim
            </Button>
          </Link>
        </div>

        <p className="text-xs text-[#0F2A43]/40 mt-6">
          Herhangi bir sorunuz varsa, destek ekibimize ulaşabilirsiniz.
        </p>
      </motion.div>
    </div>
  );
}
