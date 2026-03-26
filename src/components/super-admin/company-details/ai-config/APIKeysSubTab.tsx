import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAIConfigurations, APIKeys } from '@/hooks/useAIConfigurations';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { invokeFn } from '@/lib/supabase-functions-adapter';
import { useToast } from '@/hooks/use-toast';
import { APIKeysSection } from './APIKeysSection';
import { Save, Loader2, Volume2, RefreshCw, Play, Pause } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

interface APIKeysSubTabProps {
  companyId: string;
}

const DEFAULT_AUDIO_SETTINGS = {
  elevenlabs_stability: 0.5,
  elevenlabs_similarity: 0.75,
  elevenlabs_style: 0,
  elevenlabs_speaker_boost: true,
  elevenlabs_remove_background_noise: false,
};

export function APIKeysSubTab({ companyId }: APIKeysSubTabProps) {
  const { toast } = useToast();
  const { configurations, updateConfiguration, isUpdating } = useAIConfigurations(companyId);
  const { setDirty } = useUnsavedChanges();
  
  const existingConfig = configurations?.[0];
  const apiKey = existingConfig?.api_keys?.elevenlabs;
  
  const [apiKeys, setApiKeys] = useState<APIKeys>({});
  const [preferredModel, setPreferredModel] = useState('gpt-4.1-mini-2025-04-14');

  // Audio state
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [stability, setStability] = useState(DEFAULT_AUDIO_SETTINGS.elevenlabs_stability);
  const [similarity, setSimilarity] = useState(DEFAULT_AUDIO_SETTINGS.elevenlabs_similarity);
  const [style, setStyle] = useState(DEFAULT_AUDIO_SETTINGS.elevenlabs_style);
  const [speakerBoost, setSpeakerBoost] = useState(DEFAULT_AUDIO_SETTINGS.elevenlabs_speaker_boost);
  const [removeBackgroundNoise, setRemoveBackgroundNoise] = useState(DEFAULT_AUDIO_SETTINGS.elevenlabs_remove_background_noise);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (existingConfig) {
      setApiKeys(existingConfig.api_keys || {});
      setPreferredModel(existingConfig.behavior_settings?.preferred_model || 'gpt-4.1-mini-2025-04-14');
      
      const keys = existingConfig.api_keys || {};
      setSelectedVoice(keys.elevenlabs_voice_id || '');
      setStability(keys.elevenlabs_stability ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_stability);
      setSimilarity(keys.elevenlabs_similarity ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_similarity);
      setStyle(keys.elevenlabs_style ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_style);
      setSpeakerBoost(keys.elevenlabs_speaker_boost ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_speaker_boost);
      setRemoveBackgroundNoise(keys.elevenlabs_remove_background_noise ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_remove_background_noise);
    }
  }, [existingConfig]);

  useEffect(() => {
    if (apiKey) fetchVoices();
  }, [apiKey]);

  const fetchVoices = async () => {
    if (!apiKey) return;
    setLoadingVoices(true);
    try {
      const { data, error } = await invokeFn('get-elevenlabs-voices', { api_key: apiKey });
      if (error) throw error;
      setVoices(data.voices || []);
    } catch (error: any) {
      console.error('Erro ao buscar vozes:', error);
      toast({
        title: 'Erro ao buscar vozes',
        description: error.message || 'Não foi possível carregar as vozes da ElevenLabs',
        variant: 'destructive',
      });
    } finally {
      setLoadingVoices(false);
    }
  };

  const handlePlayPreview = (voice: Voice) => {
    if (!voice.preview_url) return;
    if (playingPreview === voice.voice_id) {
      audioElement?.pause();
      setPlayingPreview(null);
      return;
    }
    if (audioElement) audioElement.pause();
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlayingPreview(null);
    audio.play();
    setAudioElement(audio);
    setPlayingPreview(voice.voice_id);
  };

  const handleResetAudio = () => {
    setStability(DEFAULT_AUDIO_SETTINGS.elevenlabs_stability);
    setSimilarity(DEFAULT_AUDIO_SETTINGS.elevenlabs_similarity);
    setStyle(DEFAULT_AUDIO_SETTINGS.elevenlabs_style);
    setSpeakerBoost(DEFAULT_AUDIO_SETTINGS.elevenlabs_speaker_boost);
    setRemoveBackgroundNoise(DEFAULT_AUDIO_SETTINGS.elevenlabs_remove_background_noise);
    setDirty(true);
    toast({ title: 'Valores de áudio resetados para o padrão' });
  };

  const handleSave = async () => {
    if (!existingConfig) {
      toast({
        title: "Erro",
        description: "Crie primeiro a configuração básica na aba Prompts",
        variant: "destructive",
      });
      return;
    }

    // Validate key formats before saving
    const keyChecks: { key: string | undefined; name: string; prefixes: string[] }[] = [
      { key: apiKeys.openai, name: 'OpenAI', prefixes: ['sk-'] },
      { key: apiKeys.anthropic, name: 'Anthropic', prefixes: ['sk-ant-'] },
      { key: apiKeys.gemini, name: 'Gemini', prefixes: ['AIza'] },
      { key: apiKeys.elevenlabs, name: 'ElevenLabs', prefixes: ['el_', 'sk_'] },
    ];

    for (const check of keyChecks) {
      if (check.key && check.key.trim() !== '' && !check.prefixes.some(p => check.key!.startsWith(p))) {
        toast({
          title: `Chave ${check.name} inválida`,
          description: `A chave ${check.name} deve começar com "${check.prefixes.join('" ou "')}"`,
          variant: "destructive",
        });
        return;
      }
    }

    const mergedApiKeys: APIKeys = {
      ...apiKeys,
      elevenlabs_voice_id: selectedVoice || undefined,
      elevenlabs_stability: stability,
      elevenlabs_similarity: similarity,
      elevenlabs_style: style,
      elevenlabs_speaker_boost: speakerBoost,
      elevenlabs_remove_background_noise: removeBackgroundNoise,
    };

    updateConfiguration(
      {
        id: existingConfig.id,
        updates: {
          api_keys: mergedApiKeys,
          behavior_settings: {
            ...existingConfig?.behavior_settings,
            preferred_model: preferredModel,
          },
        },
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast({ title: 'API Keys salvas com sucesso!' });
        },
      }
    );
  };

  const showAudioSection = !!apiKeys.elevenlabs;
  const selectedVoiceData = voices.find(v => v.voice_id === selectedVoice);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">🔑 API Keys & Áudio</h3>
        <p className="text-sm text-muted-foreground">
          Configure API Keys e serviços de IA (OpenAI, Anthropic, ElevenLabs)
        </p>
      </div>
      
      {/* API Keys Card */}
      <Card>
        <CardHeader>
          <CardTitle>Chaves de API</CardTitle>
          <CardDescription>
            Configure as API Keys para consumir serviços de IA (OpenAI, Anthropic, ElevenLabs, etc)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <APIKeysSection
            apiKeys={apiKeys}
            preferredModel={preferredModel}
            onAPIKeysChange={(k) => { setApiKeys(k); setDirty(true); }}
            onPreferredModelChange={(m) => { setPreferredModel(m); setDirty(true); }}
          />
        </CardContent>
      </Card>

      {/* Audio Section - only shows when ElevenLabs key is set */}
      {showAudioSection && (
        <>
          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="h-5 w-5" />
                Seleção de Voz
              </CardTitle>
              <CardDescription>
                Escolha a voz que será usada para respostas em áudio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={selectedVoice} onValueChange={(v) => { setSelectedVoice(v); setDirty(true); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma voz" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((voice) => (
                        <SelectItem key={voice.voice_id} value={voice.voice_id}>
                          <div className="flex items-center gap-2">
                            <span>{voice.name}</span>
                            {voice.labels?.gender && (
                              <span className="text-xs text-muted-foreground">
                                ({voice.labels.gender})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="icon" onClick={fetchVoices} disabled={loadingVoices}>
                  {loadingVoices ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>

              {selectedVoiceData?.preview_url && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <Button variant="ghost" size="sm" onClick={() => handlePlayPreview(selectedVoiceData)}>
                    {playingPreview === selectedVoiceData.voice_id ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                    {playingPreview === selectedVoiceData.voice_id ? 'Pausar' : 'Ouvir Preview'}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {selectedVoiceData.name}
                    {selectedVoiceData.labels?.accent && ` • ${selectedVoiceData.labels.accent}`}
                  </span>
                </div>
              )}

              {loadingVoices && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando vozes...
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurações de Voz</CardTitle>
              <CardDescription>Ajuste os parâmetros de geração de áudio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Estabilidade</Label>
                  <span className="text-sm text-muted-foreground">{(stability * 100).toFixed(0)}%</span>
                </div>
                <Slider value={[stability]} onValueChange={([v]) => { setStability(v); setDirty(true); }} min={0} max={1} step={0.01} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Mais variável</span><span>Mais estável</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Similaridade</Label>
                  <span className="text-sm text-muted-foreground">{(similarity * 100).toFixed(0)}%</span>
                </div>
                <Slider value={[similarity]} onValueChange={([v]) => { setSimilarity(v); setDirty(true); }} min={0} max={1} step={0.01} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Baixa</span><span>Alta</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Exagero de Estilo</Label>
                  <span className="text-sm text-muted-foreground">{(style * 100).toFixed(0)}%</span>
                </div>
                <Slider value={[style]} onValueChange={([v]) => { setStyle(v); setDirty(true); }} min={0} max={1} step={0.01} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Nenhum</span><span>Exagerado</span>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Speaker Boost</Label>
                    <p className="text-sm text-muted-foreground">Melhora a clareza e similaridade da voz</p>
                  </div>
                  <Switch checked={speakerBoost} onCheckedChange={(v) => { setSpeakerBoost(v); setDirty(true); }} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Remover Ruído de Fundo</Label>
                    <p className="text-sm text-muted-foreground">Remove ruídos do áudio de entrada</p>
                  </div>
                  <Switch checked={removeBackgroundNoise} onCheckedChange={(v) => { setRemoveBackgroundNoise(v); setDirty(true); }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-start">
            <Button variant="outline" onClick={handleResetAudio}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Resetar Valores de Áudio
            </Button>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar API Keys
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
