import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { PreferencesProvider } from "@/app/providers/PreferencesProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <PreferencesProvider>{children}</PreferencesProvider>
    </QueryClientProvider>
  );
}
