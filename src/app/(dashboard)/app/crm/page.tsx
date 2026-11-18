'use client'
import { Suspense } from 'react'
import Solicitacoes from '@/views/pages/app/Solicitacoes'

/**
 * CRM do restaurante: eventos personalizados + atendimento humano. O funil
 * antigo de clientes (views/pages/app/CRM.tsx) saiu do menu.
 */
export default function Page() {
  return (
    <Suspense>
      <Solicitacoes />
    </Suspense>
  )
}
