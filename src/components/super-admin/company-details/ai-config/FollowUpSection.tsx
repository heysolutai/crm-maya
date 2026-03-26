import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FollowUpStagesConfig } from "../FollowUpStagesConfig";
import { FollowUpStage } from "@/hooks/useAIConfigurations";

interface FollowUpSectionProps {
  enabled: boolean;
  stages: FollowUpStage[];
  onEnabledChange: (enabled: boolean) => void;
  onStagesChange: (stages: FollowUpStage[]) => void;
}

export function FollowUpSection({
  enabled,
  stages,
  onEnabledChange,
  onStagesChange,
}: FollowUpSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="space-y-0.5">
          <Label htmlFor="follow-up-enabled">Ativar Follow-up Automático</Label>
          <p className="text-sm text-muted-foreground">
            Sistema de 5 janelas de follow-up para reengajar leads
          </p>
        </div>
        <Switch
          id="follow-up-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && (
        <FollowUpStagesConfig stages={stages} onChange={onStagesChange} />
      )}
    </div>
  );
}
