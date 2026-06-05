'use client'
import { use } from 'react'
import CampaignDetail from '@/views/pages/app/CampaignDetail'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <CampaignDetail campaignId={id} />
}
