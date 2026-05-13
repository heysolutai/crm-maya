'use client'
import { useParams } from 'next/navigation'
import AiAgentDetail from '@/views/pages/app/AiAgentDetail'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <AiAgentDetail aiAgentId={params.id} />
}
