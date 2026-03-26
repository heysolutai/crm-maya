import { AIPromptsEditor } from '@/components/ai';

interface PromptsSubTabProps {
  companyId: string;
}

export function PromptsSubTab({ companyId }: PromptsSubTabProps) {
  return (
    <AIPromptsEditor 
      companyId={companyId} 
      variant="full"
      showConfigInfo={true}
      showVariablesCard={true}
    />
  );
}

