import { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Key, AlertTriangle } from "lucide-react";
import { APIKeys } from "@/hooks/useAIConfigurations";
import { AI_MODELS } from "@/lib/aiModels";

interface APIKeysSectionProps {
  apiKeys: APIKeys;
  preferredModel: string;
  onAPIKeysChange: (keys: APIKeys) => void;
  onPreferredModelChange: (model: string) => void;
}

const KEY_VALIDATIONS: Record<string, { prefix: string[]; hint: string }> = {
  openai: { prefix: ['sk-'], hint: 'Deve começar com "sk-"' },
  anthropic: { prefix: ['sk-ant-'], hint: 'Deve começar com "sk-ant-"' },
  gemini: { prefix: ['AIza'], hint: 'Deve começar com "AIza"' },
  elevenlabs: { prefix: ['el_', 'sk_'], hint: 'Deve começar com "el_" ou "sk_"' },
};

export type LLMProvider = 'openai' | 'google';

const LLM_PROVIDERS: { value: LLMProvider; label: string; icon: string; description: string }[] = [
  { value: 'openai', label: 'OpenAI', icon: '🤖', description: 'GPT-4.1, GPT-5, O3, O4' },
  { value: 'google', label: 'Google Gemini', icon: '✨', description: 'Gemini 2.5 Pro, Flash, Flash Lite' },
];

function isKeyFormatValid(provider: string, value: string | undefined): boolean {
  if (!value || value.trim() === '') return true;
  const validation = KEY_VALIDATIONS[provider];
  if (!validation) return true;
  return validation.prefix.some(p => value.startsWith(p));
}

export function APIKeysSection({
  apiKeys,
  preferredModel,
  onAPIKeysChange,
  onPreferredModelChange,
}: APIKeysSectionProps) {
  const activeProvider: LLMProvider = (apiKeys as any).active_llm_provider || 'openai';

  const setActiveProvider = (provider: LLMProvider) => {
    onAPIKeysChange({ ...apiKeys, active_llm_provider: provider } as any);
    // Auto-select a default model for the provider
    const providerModels = AI_MODELS.filter(m => m.provider === provider);
    if (providerModels.length > 0 && !providerModels.some(m => m.value === preferredModel)) {
      onPreferredModelChange(providerModels[0].value);
    }
  };

  const [showKeys, setShowKeys] = useState({
    openai: false,
    gemini: false,
    elevenlabs: false,
    anthropic: false,
  });

  const validations = useMemo(() => ({
    openai: isKeyFormatValid('openai', apiKeys.openai),
    anthropic: isKeyFormatValid('anthropic', apiKeys.anthropic),
    gemini: isKeyFormatValid('gemini', apiKeys.gemini),
    elevenlabs: isKeyFormatValid('elevenlabs', apiKeys.elevenlabs),
  }), [apiKeys]);

  const getKeyDisplay = (key: string | undefined) => key || "";

  const filteredModels = AI_MODELS.filter(m => m.provider === activeProvider);

  const renderKeyInput = (
    id: string,
    label: string,
    provider: keyof typeof validations,
    placeholder: string,
    value: string | undefined,
    onChange: (val: string) => void,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type={showKeys[provider] ? "text" : "password"}
          value={getKeyDisplay(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={!validations[provider] ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }))}
        >
          {showKeys[provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {!validations[provider] && (
        <div className="flex items-center gap-1.5 text-destructive text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Chave inválida — {KEY_VALIDATIONS[provider]?.hint}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Key className="h-4 w-4" />
        <p>As chaves de API são armazenadas de forma segura e criptografada</p>
      </div>

      {/* LLM Provider Selector */}
      <div className="space-y-2">
        <Label>Provedor LLM Ativo</Label>
        <div className="grid grid-cols-2 gap-3">
          {LLM_PROVIDERS.map((provider) => (
            <button
              key={provider.value}
              type="button"
              onClick={() => setActiveProvider(provider.value)}
              className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border-2 transition-all text-left ${
                activeProvider === provider.value
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
              }`}
            >
              <span className="text-2xl">{provider.icon}</span>
              <span className="font-semibold text-sm">{provider.label}</span>
              <span className="text-xs text-muted-foreground text-center">{provider.description}</span>
              {activeProvider === provider.value && (
                <span className="text-xs font-medium text-primary mt-1">✓ Ativo</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* API Key for selected provider */}
      {activeProvider === 'openai' && renderKeyInput(
        "openai-key", "OpenAI API Key", "openai", "sk-proj-...",
        apiKeys.openai, (v) => onAPIKeysChange({ ...apiKeys, openai: v })
      )}

      {activeProvider === 'google' && renderKeyInput(
        "gemini-key", "Google Gemini API Key", "gemini", "AIza...",
        apiKeys.gemini, (v) => onAPIKeysChange({ ...apiKeys, gemini: v })
      )}

      <div className="space-y-2">
        <Label htmlFor="preferred-model">Modelo Preferido ({activeProvider === 'openai' ? 'OpenAI' : 'Gemini'})</Label>
        <Select value={preferredModel} onValueChange={onPreferredModelChange}>
          <SelectTrigger id="preferred-model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filteredModels.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {renderKeyInput("elevenlabs-key", "ElevenLabs API Key (Text-to-Speech)", "elevenlabs", "el_...",
        apiKeys.elevenlabs, (v) => onAPIKeysChange({ ...apiKeys, elevenlabs: v }))}

      {renderKeyInput("anthropic-key", "Anthropic API Key (Claude)", "anthropic", "sk-ant-...",
        apiKeys.anthropic, (v) => onAPIKeysChange({ ...apiKeys, anthropic: v }))}
    </div>
  );
}
