import { Route, Switch } from "wouter";
import { StorefrontLayout } from "./layouts/StorefrontLayout";
import { CartPage } from "./pages/CartPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";

export function App() {
  return <StorefrontLayout><Switch><Route path="/theme-preview" component={HomePage} /><Route path="/theme-preview/" component={HomePage} /><Route path="/theme-preview/product/:id" component={ProductDetailPage} /><Route path="/theme-preview/cart" component={CartPage} /><Route component={NotFoundPage} /></Switch></StorefrontLayout>;
}
