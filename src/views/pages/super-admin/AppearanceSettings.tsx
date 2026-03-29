'use client'

import { useState, useEffect, useRef } from 'react'
import { useBranding, BrandingData } from '@/hooks/useBranding'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Upload, Palette, Type, Image as ImageIcon, RotateCcw, Save, Loader2, Eye } from 'lucide-react'
import Image from 'next/image'

function hslToHex(hsl: string): string {
  const parts = hsl.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
  if (!parts) return '#22c55e'
  const h = parseFloat(parts[1])
  const s = parseFloat(parts[2]) / 100
  const l = parseFloat(parts[3]) / 100

  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '150 80% 36%'

  let r = parseInt(result[1], 16) / 255
  let g = parseInt(result[2], 16) / 255
  let b = parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

const defaults: BrandingData = {
  systemName: 'MiletoIA',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '150 80% 36%',
  secondaryColor: '170 70% 35%',
  accentColor: '175 60% 32%',
  loginDescription: null,
}

export default function AppearanceSettings() {
  const { branding, refresh } = useBranding()
  const [form, setForm] = useState<BrandingData>(defaults)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setForm(branding)
  }, [branding])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar')
      }
      await refresh()
      toast.success('Aparência atualizada com sucesso!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setForm(defaults)
    toast.info('Valores restaurados para o padrão. Clique em Salvar para aplicar.')
  }

  const handleUpload = async (file: File, type: 'logo' | 'favicon') => {
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingFavicon
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'branding')

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Upload falhou')
      const data = await res.json()

      setForm(prev => ({
        ...prev,
        [type === 'logo' ? 'logoUrl' : 'faviconUrl']: data.url,
      }))
      toast.success(`${type === 'logo' ? 'Logo' : 'Favicon'} enviado!`)
    } catch (e: any) {
      toast.error(e.message || 'Erro no upload')
    } finally {
      setUploading(false)
    }
  }

  const colorPresets = [
    { name: 'Verde (Padrão)', primary: '150 80% 36%', secondary: '170 70% 35%', accent: '175 60% 32%' },
    { name: 'Azul', primary: '217 91% 60%', secondary: '199 89% 48%', accent: '210 80% 45%' },
    { name: 'Roxo', primary: '262 83% 58%', secondary: '280 65% 50%', accent: '290 55% 45%' },
    { name: 'Laranja', primary: '25 95% 53%', secondary: '15 80% 50%', accent: '35 90% 48%' },
    { name: 'Rosa', primary: '330 81% 60%', secondary: '340 75% 55%', accent: '350 70% 50%' },
    { name: 'Vermelho', primary: '0 84% 60%', secondary: '10 78% 54%', accent: '350 80% 50%' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Aparência</h1>
        <p className="text-muted-foreground mt-1">
          Personalize a identidade visual do sistema — logo, cores e nome.
        </p>
      </div>

      {/* System Name & Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Identidade
          </CardTitle>
          <CardDescription>Nome do sistema e descrição exibida na tela de login</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="systemName">Nome do Sistema</Label>
            <Input
              id="systemName"
              value={form.systemName}
              onChange={(e) => setForm(prev => ({ ...prev, systemName: e.target.value }))}
              placeholder="Nome do seu CRM"
            />
            <p className="text-xs text-muted-foreground">
              Aparece no login, sidebar e título da p��gina
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="loginDescription">Descrição do Login</Label>
            <Textarea
              id="loginDescription"
              value={form.loginDescription || ''}
              onChange={(e) => setForm(prev => ({ ...prev, loginDescription: e.target.value || null }))}
              placeholder="O CRM mais inteligente para impulsionar suas vendas"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Logo & Favicon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Logo & Favicon
          </CardTitle>
          <CardDescription>Imagens de marca exibidas no sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo */}
            <div className="space-y-3">
              <Label>Logo Principal</Label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/50">
                  {form.logoUrl ? (
                    <Image src={form.logoUrl} alt="Logo" width={80} height={80} className="object-contain" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'logo')}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Enviar Logo
                  </Button>
                  {form.logoUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm(prev => ({ ...prev, logoUrl: null }))}
                      className="text-destructive"
                    >
                      Remover
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">PNG ou SVG, recomendado 256x256</p>
                </div>
              </div>
            </div>

            {/* Favicon */}
            <div className="space-y-3">
              <Label>Favicon</Label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/50">
                  {form.faviconUrl ? (
                    <Image src={form.faviconUrl} alt="Favicon" width={64} height={64} className="object-contain" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png,image/x-icon,image/svg+xml"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'favicon')}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => faviconInputRef.current?.click()}
                    disabled={uploadingFavicon}
                  >
                    {uploadingFavicon ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Enviar Favicon
                  </Button>
                  {form.faviconUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm(prev => ({ ...prev, faviconUrl: null }))}
                      className="text-destructive"
                    >
                      Remover
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">ICO, PNG ou SVG, 32x32 ou 64x64</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Cores
          </CardTitle>
          <CardDescription>Defina as cores principais do sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Presets */}
          <div className="space-y-3">
            <Label>Temas Prontos</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {colorPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setForm(prev => ({
                    ...prev,
                    primaryColor: preset.primary,
                    secondaryColor: preset.secondary,
                    accentColor: preset.accent,
                  }))}
                  className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/50 transition-all"
                >
                  <div className="flex gap-1">
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${preset.primary})` }}
                    />
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${preset.secondary})` }}
                    />
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${preset.accent})` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Custom colors */}
          <div className="space-y-3">
            <Label>Cores Personalizadas</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cor Primária</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={hslToHex(form.primaryColor)}
                    onChange={(e) => setForm(prev => ({ ...prev, primaryColor: hexToHsl(e.target.value) }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Primária</p>
                    <p className="text-xs text-muted-foreground">Botões, links, sidebar ativa</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cor Secundária</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={hslToHex(form.secondaryColor)}
                    onChange={(e) => setForm(prev => ({ ...prev, secondaryColor: hexToHsl(e.target.value) }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Secundária</p>
                    <p className="text-xs text-muted-foreground">Gradientes, destaques</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cor de Acento</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={hslToHex(form.accentColor)}
                    onChange={(e) => setForm(prev => ({ ...prev, accentColor: hexToHsl(e.target.value) }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Acento</p>
                    <p className="text-xs text-muted-foreground">Detalhes complementares</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <Separator />
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </Label>
            <div className="p-6 rounded-xl border border-border bg-card space-y-4">
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  <Image src={form.logoUrl} alt="Preview" width={40} height={40} className="rounded-lg" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: `hsl(${form.primaryColor})` }}
                  >
                    {form.systemName.charAt(0)}
                  </div>
                )}
                <span
                  className="text-xl font-bold bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(to right, hsl(${form.primaryColor}), hsl(${form.secondaryColor}))`,
                  }}
                >
                  {form.systemName}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  style={{
                    backgroundImage: `linear-gradient(to right, hsl(${form.primaryColor}), hsl(${form.secondaryColor}))`,
                    color: 'white',
                  }}
                >
                  Botão Primário
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  style={{
                    borderColor: `hsl(${form.primaryColor})`,
                    color: `hsl(${form.primaryColor})`,
                  }}
                >
                  Botão Outline
                </Button>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                  style={{ backgroundColor: `hsl(${form.primaryColor} / 0.1)`, color: `hsl(${form.primaryColor})` }}
                >
                  Badge Exemplo
                </div>
              </div>
              <div className="flex gap-3">
                <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: `hsl(${form.primaryColor})` }} />
                <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: `hsl(${form.secondaryColor})` }} />
                <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: `hsl(${form.accentColor})` }} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-8">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Alterações
        </Button>
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Restaurar Padrão
        </Button>
      </div>
    </div>
  )
}
