import { AIPromptsEditor } from '@/components/ai';
import { SimpleAgentConfig } from '@/components/ai/SimpleAgentConfig';

interface PromptsSubTabProps {
  companyId: string;
}

/**
 * Prompts da empresa no painel administrativo.
 *
 * Aqui so existia o editor de texto puro (AIPromptsEditor). Os dados que
 * ALIMENTAM o prompt — nome do restaurante, endereco, horarios, precos —
 * moravam exclusivamente em /app/inboxes/[id], que e outra tela. Resultado:
 * dava pra reescrever o prompt inteiro por aqui, mas nao pra corrigir o nome
 * do restaurante que aparece nele.
 *
 * O formulario simples entra primeiro por ser o caminho que quase todo mundo
 * quer; o editor avancado continua logo abaixo, pra quem precisa mexer no
 * texto na mao.
 */
export function PromptsSubTab({ companyId }: PromptsSubTabProps) {
  return (
    <div className="space-y-6">
      <SimpleAgentConfig companyId={companyId} />

      <AIPromptsEditor
        companyId={companyId}
        variant="full"
        showConfigInfo={true}
        showVariablesCard={true}
      />
    </div>
  );
}

