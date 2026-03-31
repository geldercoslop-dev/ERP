import "./sentry";
import "./wdyr";
import { trpc, trpcClientConfig } from "./lib/trpcClient";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import GlobalErrorBoundary from "./components/system/GlobalErrorBoundary";
import "./index.css";
import { Toaster } from "sonner";
import { handleGlobalTrpcOrQueryError } from "./lib/api/globalTrpcErrorHandler";
import { ApiHealthProvider } from "./contexts/ApiHealthContext";

// ÚNICA instância: QueryClient e tRPC client criados uma vez, fora do render. Não criar client dentro de componentes.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleGlobalTrpcOrQueryError,
  }),
  mutationCache: new MutationCache({
    onError: handleGlobalTrpcOrQueryError,
  }),
});
const trpcClient = trpc.createClient(trpcClientConfig);

const rootEl = document.getElementById("root")!;

// Um único root: Toaster dentro da árvore evita conflito removeChild ao navegar (Clientes, Promoções, etc.)
createRoot(rootEl).render(
  <GlobalErrorBoundary>
    <ApiHealthProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster richColors position="top-right" />
        </QueryClientProvider>
      </trpc.Provider>
    </ApiHealthProvider>
  </GlobalErrorBoundary>
);
