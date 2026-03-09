/*
 * NovaStore Trust Section
 * Design: Trust badges with blue line icons, clean layout
 */

import { motion } from "framer-motion";
import { ShieldCheck, Truck, Headphones, RefreshCw } from "lucide-react";

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Güvenli Ödeme",
    description: "256-bit SSL şifreleme ile güvenli alışveriş yapın. Tüm ödeme bilgileriniz koruma altında.",
  },
  {
    icon: Truck,
    title: "Hızlı Kargo",
    description: "Siparişleriniz aynı gün kargoya verilir. 1-3 iş günü içinde kapınızda.",
  },
  {
    icon: Headphones,
    title: "7/24 Destek",
    description: "Müşteri hizmetlerimiz her an yanınızda. Sorularınız için bize ulaşın.",
  },
  {
    icon: RefreshCw,
    title: "Kolay İade",
    description: "14 gün içinde koşulsuz iade garantisi. Memnun kalmazsanız iade edin.",
  },
];

export default function TrustSection() {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0F2A43] inline-block section-title">
            Neden NovaStore?
          </h2>
          <p className="text-[#0F2A43]/60 mt-5 text-lg max-w-lg mx-auto">
            Güvenli alışveriş deneyimi için ihtiyacınız olan her şey burada.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {trustItems.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group text-center p-8 rounded-2xl bg-[#F5F7FA] hover:bg-white hover:shadow-xl hover:shadow-[#0F2A43]/5 transition-all duration-400 border border-transparent hover:border-[#0F2A43]/5"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#0F2A43]/5 to-[#1E4E79]/10 flex items-center justify-center mb-5 group-hover:from-[#0F2A43]/10 group-hover:to-[#1E4E79]/15 transition-all duration-300">
                <item.icon
                  size={28}
                  className="text-[#1E4E79] group-hover:text-[#F7941D] transition-colors duration-300"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="font-semibold text-[#0F2A43] text-lg mb-2">
                {item.title}
              </h3>
              <p className="text-[#0F2A43]/55 text-sm leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
