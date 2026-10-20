import { SimpleAgentConfig } from '@/components/ai/SimpleAgentConfig';

interface PromptsSubTabProps {
  companyId: string;
}

/**
 * Prompts do restaurante no painel administrativo.
 *
 * Mesmo formulario que o restaurante usa (nome, endereco, horarios, precos e
 * instrucoes extras). O texto completo, para quem precisa mexer na mao, fica
 * dentro dele (secao "Editar o texto completo"), junto do aviso de que salvar
 * o formulario gera o texto de novo. Antes o editor de texto puro ficava ao
 * lado, e salvar um apagava a edicao do outro.
 */
export function PromptsSubTab({ companyId }: PromptsSubTabProps) {
  return (
    <div className="space-y-6">
      <SimpleAgentConfig companyId={companyId} />
    </div>
  );
}
