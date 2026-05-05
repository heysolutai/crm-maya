import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politica de Privacidade',
  description: 'Politica de privacidade e protecao de dados da plataforma.',
}

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold mb-2">Politica de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Ultima atualizacao: Março de 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Introducao</h2>
            <p>
              A Wyarp (&quot;nos&quot;, &quot;nosso&quot; ou &quot;Empresa&quot;), operadora da plataforma de CRM disponivel em
              crm.miletoia.com.br, esta comprometida com a protecao da privacidade e dos dados pessoais de seus
              usuarios, em conformidade com a Lei Geral de Protecao de Dados Pessoais (LGPD - Lei n. 13.709/2018)
              e demais legislacoes aplicaveis.
            </p>
            <p>
              Esta Politica de Privacidade descreve como coletamos, utilizamos, armazenamos e protegemos suas
              informacoes pessoais ao utilizar nossa plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Dados que Coletamos</h2>
            <p>Coletamos os seguintes tipos de dados:</p>
            <h3 className="text-base font-medium text-foreground mt-4 mb-2">2.1. Dados fornecidos pelo usuario</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Nome completo e email para criacao de conta</li>
              <li>Dados da empresa (nome, CNPJ, telefone, endereco)</li>
              <li>Informacoes de clientes cadastrados no CRM (nome, telefone, email)</li>
              <li>Conteudo de mensagens e conversas via WhatsApp integrado</li>
              <li>Dados de agendamentos e compromissos</li>
            </ul>
            <h3 className="text-base font-medium text-foreground mt-4 mb-2">2.2. Dados coletados automaticamente</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Endereco IP e informacoes do navegador</li>
              <li>Dados de uso e navegacao na plataforma</li>
              <li>Cookies e tecnologias similares</li>
              <li>Logs de acesso e atividades</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Finalidade do Tratamento</h2>
            <p>Utilizamos seus dados para as seguintes finalidades:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Prestacao dos servicos contratados (CRM, WhatsApp, agendamentos, IA)</li>
              <li>Autenticacao e seguranca da conta</li>
              <li>Processamento de mensagens via integracao WhatsApp (UazAPI)</li>
              <li>Funcionamento do assistente de inteligencia artificial</li>
              <li>Sincronizacao com Google Calendar</li>
              <li>Geracao de relatorios e analytics</li>
              <li>Comunicacao sobre atualizacoes e suporte tecnico</li>
              <li>Cumprimento de obrigacoes legais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Base Legal</h2>
            <p>O tratamento de dados pessoais e realizado com base nas seguintes hipoteses legais da LGPD:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong className="text-foreground">Execucao de contrato:</strong> para prestacao dos servicos da plataforma</li>
              <li><strong className="text-foreground">Consentimento:</strong> para integracoes com terceiros (Google Calendar, WhatsApp)</li>
              <li><strong className="text-foreground">Interesse legitimo:</strong> para melhoria dos servicos e seguranca</li>
              <li><strong className="text-foreground">Obrigacao legal:</strong> para cumprimento de legislacao aplicavel</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Compartilhamento de Dados</h2>
            <p>Seus dados podem ser compartilhados com:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong className="text-foreground">UazAPI:</strong> para envio e recebimento de mensagens WhatsApp</li>
              <li><strong className="text-foreground">Google:</strong> para sincronizacao de calendario (quando autorizado)</li>
              <li><strong className="text-foreground">Supabase:</strong> para armazenamento seguro de dados</li>
              <li><strong className="text-foreground">Provedores de IA:</strong> para processamento de linguagem natural no assistente virtual</li>
            </ul>
            <p className="mt-2">
              Nao vendemos, alugamos ou comercializamos seus dados pessoais para terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Armazenamento e Seguranca</h2>
            <p>
              Seus dados sao armazenados em servidores seguros com criptografia em transito (TLS/SSL)
              e em repouso. Adotamos medidas tecnicas e organizacionais para proteger seus dados contra
              acessos nao autorizados, perda ou destruicao, incluindo:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Autenticacao segura com tokens JWT</li>
              <li>Controle de acesso baseado em funcoes (RBAC)</li>
              <li>Chaves de API com escopo por empresa</li>
              <li>Monitoramento e logs de acesso</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Retencao de Dados</h2>
            <p>
              Seus dados serao mantidos enquanto sua conta estiver ativa ou conforme necessario para
              prestar os servicos. Apos a exclusao da conta, os dados serao removidos em ate 30 dias,
              exceto quando houver obrigacao legal de retencao.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Direitos do Titular</h2>
            <p>De acordo com a LGPD, voce tem direito a:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Confirmar a existencia de tratamento de seus dados</li>
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incompletos ou desatualizados</li>
              <li>Solicitar a anonimizacao, bloqueio ou eliminacao de dados</li>
              <li>Solicitar a portabilidade dos dados</li>
              <li>Revogar consentimento a qualquer momento</li>
              <li>Solicitar informacoes sobre compartilhamento com terceiros</li>
            </ul>
            <p className="mt-2">
              Para exercer seus direitos, entre em contato pelo email:{' '}
              <a href="mailto:privacidade@miletoia.com.br" className="text-primary hover:underline">
                privacidade@miletoia.com.br
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Cookies</h2>
            <p>
              Utilizamos cookies essenciais para o funcionamento da plataforma, incluindo cookies de
              sessao para autenticacao. Nao utilizamos cookies de rastreamento publicitario.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Alteracoes nesta Politica</h2>
            <p>
              Esta politica pode ser atualizada periodicamente. Notificaremos sobre alteracoes
              significativas atraves da plataforma ou por email. O uso continuado apos as alteracoes
              constitui aceitacao da politica atualizada.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contato</h2>
            <p>
              Para duvidas sobre esta politica ou sobre o tratamento de seus dados pessoais,
              entre em contato:
            </p>
            <ul className="list-none pl-0 space-y-1 mt-2">
              <li><strong className="text-foreground">Empresa:</strong> Wyarp</li>
              <li><strong className="text-foreground">Plataforma:</strong> crm.miletoia.com.br</li>
              <li><strong className="text-foreground">Email:</strong>{' '}
                <a href="mailto:privacidade@miletoia.com.br" className="text-primary hover:underline">
                  privacidade@miletoia.com.br
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
