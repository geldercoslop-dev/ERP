import "./sentry";
import "./wdyr";
import { trpc, trpcClientConfig } from "@/lib/trpcClient";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import { Toaster } from "sonner";

// ÚNICA instância: QueryClient e tRPC client criados uma vez, fora do render. Não criar client dentro de componentes.
const queryClient = new QueryClient();
const trpcClient = trpc.createClient(trpcClientConfig);

const rootEl = document.getElementById("root")!;

// Um único root: Toaster dentro da árvore evita conflito removeChild ao navegar (Clientes, Promoções, etc.)
createRoot(rootEl).render(
  <ErrorBoundary>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </trpc.Provider>
  </ErrorBoundary>
);
