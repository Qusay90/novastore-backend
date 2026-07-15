import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CartProvider } from "./state/CartContext";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const root = document.getElementById("root");
if (!root) throw new Error("Tema önizleme kök elementi bulunamadı.");

createRoot(root).render(<StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><CartProvider><App /></CartProvider></QueryClientProvider></ErrorBoundary></StrictMode>);
