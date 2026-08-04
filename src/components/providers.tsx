'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/hooks/useAuth'
import { ImpersonationProvider } from '@/hooks/useImpersonation'
import { BrandingProvider } from '@/hooks/useBranding'
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

  // A sessao expira por INATIVIDADE (1h). Sem renovar do lado do navegador,
  // quem fica so acompanhando as conversas — lendo a tela, sem clicar em nada
  // — seria deslogado no meio do expediente, porque "olhar" nao gera
  // requisicao nenhuma.
  //
  // Entao renovamos a cada 5 min enquanto a aba estiver aberta. Isso NAO torna
  // a sessao eterna: o teto absoluto de 3h vive no servidor (SESSAO_MAX em
  // lib/auth.ts) e nao ha nada que o navegador possa fazer pra escapar dele.
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <PresenceProvider>
              <ImpersonationProvider>
                <BrandingProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    {children}
                  </TooltipProvider>
                </BrandingProvider>
              </ImpersonationProvider>
            </PresenceProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
