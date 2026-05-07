'use client'
import { useParams } from 'next/navigation'
import AgentDetail from '@/views/pages/app/AgentDetail'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <AgentDetail agentId={params.id} />
}
