import { CampaignBanner } from "../components/CampaignBanner";
import { Categories } from "../components/Categories";
import { FeaturedProducts } from "../components/FeaturedProducts";
import { Hero } from "../components/Hero";
import { ResourceState } from "../components/ResourceState";
import { TrustSection } from "../components/TrustSection";
import { useCategories, useCollections, useProducts } from "../hooks/useCatalog";

export function HomePage() {
  const products = useProducts();
  const categories = useCategories();
  const collections = useCollections();
  const productItems = products.data ?? [];
  const retry = () => { products.refetch(); categories.refetch(); collections.refetch(); };
  return <>
    <Hero />
    {products.isLoading || categories.isLoading
      ? <ResourceState title="Vitrin hazırlanıyor" message="NovaStore kataloğu yükleniyor…" />
      : products.isError
        ? <ResourceState title="Ürünler yüklenemedi" message={products.error.message} actionLabel="Tekrar Dene" onAction={retry} />
        : productItems.length === 0
          ? <ResourceState title="Vitrin şu anda boş" message="Yayınlanmış ürünler burada gösterilecek." actionLabel="Yenile" onAction={retry} />
          : <><Categories categories={categories.data ?? []} /><FeaturedProducts products={productItems} /><CampaignBanner collection={collections.data?.[0]} /><TrustSection /></>}
  </>;
}
