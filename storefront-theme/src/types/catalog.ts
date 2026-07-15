export interface ProductMedia {
  id: number | null;
  url: string;
  altText: string;
  isVideo: boolean;
}

export interface ProductAttribute {
  code: string;
  name: string;
  value: unknown;
  unit: string | null;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  oldPrice: number | null;
  stock: number;
  imageUrl: string;
  categories: string[];
  category: string;
  rating: number;
  reviewCount: number;
  purchasable: boolean;
  media: ProductMedia[];
  attributes: ProductAttribute[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  path: string;
  productCount: number;
}

export interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface CartItem {
  id: number;
  productId: number;
  name: string;
  price: number;
  oldPrice: number | null;
  image: string;
  imageUrl: string;
  quantity: number;
  selected: boolean;
}
