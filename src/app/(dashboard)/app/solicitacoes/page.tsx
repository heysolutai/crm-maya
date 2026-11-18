import { redirect } from 'next/navigation'

/** Endereco antigo: as Solicitacoes viraram o CRM (/app/crm). Mantem os parametros. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') qs.set(k, v)
  }
  const query = qs.toString()
  redirect(`/app/crm${query ? `?${query}` : ''}`)
}
