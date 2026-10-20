import { redirect } from 'next/navigation'

/**
 * A antiga tela "Integrações" virou parte de cada conexão (Conexões > escolher
 * o WhatsApp > Agente de IA > Ferramentas). Este endereço fica só para os
 * links antigos não darem erro 404.
 */
export default function Page() {
  redirect('/app/inboxes')
}
