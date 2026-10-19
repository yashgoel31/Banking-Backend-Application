import { useState, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { createServices, type AppServices } from '@/lib/api';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { createQueryClient } from '@/lib/query';
import { useTheme } from '@/lib/theme';
import { TooltipProvider } from '@/components/ui/overlays';
import { routes } from './routes';

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="top-right" richColors closeButton toastOptions={{ duration: 6000 }} />;
}

/** Providers shared by the app and by component tests */
export function AppProviders({ services, queryClient, children }: { services: AppServices; queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider services={services}>
        <TooltipProvider delayDuration={250}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [services] = useState(() => createServices());
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <AppProviders services={services} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
