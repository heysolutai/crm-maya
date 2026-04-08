import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso - Wyarp',
  description: 'Termos e condicoes de uso da plataforma Wyarp CRM.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-bold">W</span>
            </div>
            <span className="text-lg font-bold">Wyarp</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">Ultima atualizacao: Março de 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Aceitacao dos Termos</h2>
            <p>
              Ao acessar e utilizar a plataforma Wyarp CRM (&quot;Plataforma&quot;), disponivel em
              crm.miletoia.com.br, voce concorda com estes Termos de Uso. Se voce nao concordar com
              qualquer parte destes termos, nao utilize a Plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Descricao do Servico</h2>
            <p>A Wyarp oferece uma plataforma de CRM que inclui:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Gestao de relacionamento com clientes (CRM)</li>
              <li>Integracao com WhatsApp para atendimento via UazAPI</li>
              <li>Assistente virtual com inteligencia artificial</li>
              <li>Sistema de agendamento com integracao Google Calendar</li>
              <li>Follow-ups automatizados</li>
              <li>Relatorios e analytics</li>
              <li>Gestao de equipes e permissoes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Cadastro e Conta</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Voce deve fornecer informacoes verdadeiras e atualizadas ao criar sua conta</li>
              <li>Voce e responsavel por manter a confidencialidade de suas credenciais de acesso</li>
              <li>Cada empresa deve ter sua propria conta com chave de API exclusiva</li>
              <li>Voce e responsavel por todas as atividades realizadas com sua conta</li>
              <li>Notifique-nos imediatamente em caso de uso nao autorizado da sua conta</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Uso Permitido</h2>
            <p>Ao utilizar a Plataforma, voce concorda em:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Utilizar o servico apenas para fins comerciais legitimos</li>
              <li>Cumprir todas as leis aplicaveis, incluindo a LGPD</li>
              <li>Obter consentimento adequado dos seus clientes para coleta e tratamento de dados</li>
              <li>Nao enviar mensagens de spam ou conteudo ilegal via WhatsApp</li>
              <li>Respeitar as politicas de uso do WhatsApp e demais servicos integrados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Uso Proibido</h2>
            <p>E expressamente proibido:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Utilizar a Plataforma para atividades ilegais ou fraudulentas</li>
              <li>Enviar mensagens em massa nao solicitadas (spam)</li>
              <li>Tentar acessar dados de outras empresas ou usuarios</li>
              <li>Realizar engenharia reversa ou modificar o codigo da Plataforma</li>
              <li>Sobrecarregar intencionalmente os servidores ou APIs</li>
              <li>Compartilhar credenciais ou chaves de API com terceiros nao autorizados</li>
              <li>Utilizar a IA para gerar conteudo ilegal, difamatorio ou prejudicial</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Integracoes com Terceiros</h2>
            <p>
              A Plataforma integra-se com servicos de terceiros (WhatsApp via UazAPI, Google Calendar,
              provedores de IA). Ao ativar essas integracoes, voce concorda com os termos de uso de
              cada servico. A Wyarp nao se responsabiliza por interrupcoes ou alteracoes nos
              servicos de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Propriedade Intelectual</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>A Plataforma, incluindo seu codigo, design e marca, sao propriedade da Wyarp</li>
              <li>Voce mantem a propriedade sobre os dados que insere na Plataforma</li>
              <li>Voce nos concede licenca limitada para processar seus dados conforme necessario para a prestacao do servico</li>
              <li>Nao e permitido copiar, modificar ou redistribuir qualquer parte da Plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Disponibilidade e Suporte</h2>
            <p>
              Nos empenhamos para manter a Plataforma disponivel 24/7, porem nao garantimos
              disponibilidade ininterrupta. Manutencoes programadas serao comunicadas com
              antecedencia quando possivel. O suporte tecnico esta disponivel por email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Limitacao de Responsabilidade</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>A Plataforma e fornecida &quot;como esta&quot;, sem garantias de qualquer tipo</li>
              <li>Nao nos responsabilizamos por danos indiretos, incidentais ou consequenciais</li>
              <li>Nao garantimos que as respostas da IA sejam sempre precisas ou adequadas</li>
              <li>O usuario e responsavel por verificar e validar as informacoes geradas pela IA</li>
              <li>Nossa responsabilidade total fica limitada ao valor pago pelo servico nos ultimos 12 meses</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Suspensao e Cancelamento</h2>
            <p>
              Reservamo-nos o direito de suspender ou encerrar sua conta em caso de violacao
              destes Termos, uso abusivo da Plataforma, ou inadimplencia. Em caso de cancelamento,
              seus dados serao mantidos por 30 dias para possivel recuperacao, apos os quais serao
              permanentemente excluidos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Alteracoes nos Termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Alteracoes significativas serao
              comunicadas atraves da Plataforma ou por email com pelo menos 15 dias de antecedencia.
              O uso continuado apos as alteracoes constitui aceitacao dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">12. Legislacao Aplicavel</h2>
            <p>
              Estes Termos sao regidos pelas leis da Republica Federativa do Brasil.
              Eventuais disputas serao resolvidas no foro da comarca da sede da empresa,
              com exclusao de qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">13. Contato</h2>
            <p>Para duvidas sobre estes Termos de Uso, entre em contato:</p>
            <ul className="list-none pl-0 space-y-1 mt-2">
              <li><strong className="text-foreground">Empresa:</strong> Wyarp</li>
              <li><strong className="text-foreground">Plataforma:</strong> crm.miletoia.com.br</li>
              <li><strong className="text-foreground">Email:</strong>{' '}
                <a href="mailto:contato@miletoia.com.br" className="text-primary hover:underline">
                  contato@miletoia.com.br
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-4xl mx-auto px-4 flex justify-between text-sm text-muted-foreground">
          <span>&copy; 2024 Wyarp. Todos os direitos reservados.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacidade</Link>
            <Link href="/terms" className="hover:text-foreground">Termos de Uso</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
