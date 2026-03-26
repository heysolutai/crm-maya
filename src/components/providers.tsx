'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/hooks/useAuth'
import { ImpersonationProvider } from '@/hooks/useImpersonation'
import { PresenceProvider } from '@/hooks/usePresence'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 2,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
        <AuthProvider>
          <PresenceProvider>
            <ImpersonationProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                {children}
              </TooltipProvider>
            </ImpersonationProvider>
          </PresenceProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
