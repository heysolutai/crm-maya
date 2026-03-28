import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAIConfigurations, APIKeys } from '@/hooks/useAIConfigurations';
import { invokeFn } from '@/lib/api-functions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Volume2, RefreshCw, Play, Pause } from 'lucide-react';

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

interface AudioSubTabProps {
  companyId: string;
}

const DEFAULT_AUDIO_SETTINGS = {
  elevenlabs_stability: 0.5,
  elevenlabs_similarity: 0.75,
  elevenlabs_style: 0,
  elevenlabs_speaker_boost: true,
  elevenlabs_remove_background_noise: false,
};

export function AudioSubTab({ companyId }: AudioSubTabProps) {
  const { configurations, isLoading, updateConfiguration, isUpdating } = useAIConfigurations(companyId);
  const { toast } = useToast();
  
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

  const config = configurations?.[0];
  const apiKey = config?.api_keys?.elevenlabs;

  // Load saved settings
  useEffect(() => {
    if (config?.api_keys) {
      const keys = config.api_keys;
      setSelectedVoice(keys.elevenlabs_voice_id || '');
      setStability(keys.elevenlabs_stability ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_stability);
      setSimilarity(keys.elevenlabs_similarity ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_similarity);
      setStyle(keys.elevenlabs_style ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_style);
      setSpeakerBoost(keys.elevenlabs_speaker_boost ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_speaker_boost);
      setRemoveBackgroundNoise(keys.elevenlabs_remove_background_noise ?? DEFAULT_AUDIO_SETTINGS.elevenlabs_remove_background_noise);
    }
  }, [config]);

  // Fetch voices when API key is available
  useEffect(() => {
    if (apiKey) {
      fetchVoices();
    }
  }, [apiKey]);

  const fetchVoices = async () => {
    if (!apiKey) {
      toast({
        title: 'API Key não configurada',
        description: 'Configure a API Key da ElevenLabs na aba "API Keys" primeiro.',
        variant: 'destructive',
      });
      return;
    }

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

    if (audioElement) {
      audioElement.pause();
    }

    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlayingPreview(null);
    audio.play();
    setAudioElement(audio);
    setPlayingPreview(voice.voice_id);
  };

  const handleSave = () => {
    if (!config) return;

    const updatedApiKeys: APIKeys = {
      ...config.api_keys,
      elevenlabs_voice_id: selectedVoice || undefined,
      elevenlabs_stability: stability,
      elevenlabs_similarity: similarity,
      elevenlabs_style: style,
      elevenlabs_speaker_boost: speakerBoost,
      elevenlabs_remove_background_noise: removeBackgroundNoise,
    };

    updateConfiguration({
      id: config.id,
      updates: { api_keys: updatedApiKeys },
    });
  };

  const handleReset = () => {
    setStability(DEFAULT_AUDIO_SETTINGS.elevenlabs_stability);
    setSimilarity(DEFAULT_AUDIO_SETTINGS.elevenlabs_similarity);
    setStyle(DEFAULT_AUDIO_SETTINGS.elevenlabs_style);
    setSpeakerBoost(DEFAULT_AUDIO_SETTINGS.elevenlabs_speaker_boost);
    setRemoveBackgroundNoise(DEFAULT_AUDIO_SETTINGS.elevenlabs_remove_background_noise);
    toast({ title: 'Valores resetados para o padrão' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Volume2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Nenhuma configuração de IA encontrada. Crie uma configuração primeiro.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!apiKey) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Volume2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">API Key não configurada</h3>
          <p className="text-muted-foreground">
            Configure a API Key da ElevenLabs na aba "🔑 API Keys" para habilitar as configurações de áudio.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedVoiceData = voices.find(v => v.voice_id === selectedVoice);

  return (
    <div className="space-y-6">
      {/* Voice Selection */}
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
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
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
            <Button
              variant="outline"
              size="icon"
              onClick={fetchVoices}
              disabled={loadingVoices}
            >
              {loadingVoices ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>

          {selectedVoiceData?.preview_url && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePlayPreview(selectedVoiceData)}
              >
                {playingPreview === selectedVoiceData.voice_id ? (
                  <Pause className="h-4 w-4 mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
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

      {/* Voice Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações de Voz</CardTitle>
          <CardDescription>
            Ajuste os parâmetros de geração de áudio
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stability */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Estabilidade</Label>
              <span className="text-sm text-muted-foreground">{(stability * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[stability]}
              onValueChange={([value]) => setStability(value)}
              min={0}
              max={1}
              step={0.01}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Mais variável</span>
              <span>Mais estável</span>
            </div>
          </div>

          {/* Similarity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Similaridade</Label>
              <span className="text-sm text-muted-foreground">{(similarity * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[similarity]}
              onValueChange={([value]) => setSimilarity(value)}
              min={0}
              max={1}
              step={0.01}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Baixa</span>
              <span>Alta</span>
            </div>
          </div>

          {/* Style Exaggeration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Exagero de Estilo</Label>
              <span className="text-sm text-muted-foreground">{(style * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[style]}
              onValueChange={([value]) => setStyle(value)}
              min={0}
              max={1}
              step={0.01}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Nenhum</span>
              <span>Exagerado</span>
            </div>
          </div>

          {/* Switches */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Speaker Boost</Label>
                <p className="text-sm text-muted-foreground">
                  Melhora a clareza e similaridade da voz
                </p>
              </div>
              <Switch
                checked={speakerBoost}
                onCheckedChange={setSpeakerBoost}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Remover Ruído de Fundo</Label>
                <p className="text-sm text-muted-foreground">
                  Remove ruídos do áudio de entrada
                </p>
              </div>
              <Switch
                checked={removeBackgroundNoise}
                onCheckedChange={setRemoveBackgroundNoise}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleReset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Resetar Valores
        </Button>
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
