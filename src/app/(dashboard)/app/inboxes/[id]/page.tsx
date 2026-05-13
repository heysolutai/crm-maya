'use client'
import { useParams } from 'next/navigation'
import InboxDetail from '@/views/pages/app/InboxDetail'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <InboxDetail inboxId={params.id} />
}
