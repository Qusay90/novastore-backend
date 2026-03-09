/*
 * NovaStore Home Page
 * Design: Stellar Commerce — All sections composed together
 */

import { useAuth } from "@/_core/hooks/useAuth";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import FeaturedProducts from "@/components/FeaturedProducts";
import CampaignBanner from "@/components/CampaignBanner";
import TrustSection from "@/components/TrustSection";
import Footer from "@/components/Footer";

export default function Home() {
  // The userAuth hooks provides authentication state
  // To implement login/logout functionality, simply call logout() or redirect to getLoginUrl()
  const { user, loading, error, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <Categories />
      <FeaturedProducts />
      <CampaignBanner />
      <TrustSection />
      <Footer />
    </div>
  );
}
