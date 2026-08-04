'use client'

import { apiFetch } from '@/lib/api/client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

export interface BrandingData {
  systemName: string
  logoUrl: string | null
  faviconUrl: string | null
  primaryColor: string
  secondaryColor: string
  accentColor: string
  loginDescription: string | null
}

const defaultBranding: BrandingData = {
  systemName: 'Reservemaya',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '18 80% 51%',
  secondaryColor: '32 80% 52%',
  accentColor: '8 65% 42%',
  loginDescription: 'Sua IA atende os clientes e registra reservas no WhatsApp, 24 horas por dia.',
}

interface BrandingContextType {
  branding: BrandingData
  loading: boolean
  refresh: () => Promise<void>
}

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  loading: true,
  refresh: async () => {},
})

/** Parse "H S% L%" into numbers; null if formato invalido */
function parseHsl(s: string): { h: number; s: number; l: number } | null {
  const m = s.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
  if (!m) return null
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) }
}

/** Derive light/dark HSL variants from a base HSL string */
function deriveColors(base: string): { light: string; dark: string } {
  const hsl = parseHsl(base)
  if (!hsl) return { light: base, dark: base }
  return {
    light: `${hsl.h} ${hsl.s}% ${hsl.l}%`,
    dark: `${hsl.h} ${hsl.s}% ${Math.min(hsl.l + 9, 60)}%`,
  }
}

/** Gera uma paleta harmoniosa (analogous palette) a partir de uma cor primaria.
 * Retorna 2 cores companheiras: uma com matiz deslocado +30 graus (mais claro)
 * e outra com -30 graus (mais escuro). Cobre o caso comum de usuario que so
 * troca a primaryColor — assim os gradientes da landing/auth ficam coerentes
 * com a logo automaticamente, sem precisar ajustar 3 cores na mao.
 */
function deriveAnalogousPalette(primary: string): { companion1: string; companion2: string } {
  const hsl = parseHsl(primary)
  if (!hsl) return { companion1: primary, companion2: primary }
  const h1 = (hsl.h + 30) % 360
  const h2 = (hsl.h + 360 - 30) % 360
  return {
    companion1: `${h1} ${Math.min(hsl.s + 5, 90)}% ${Math.min(hsl.l + 8, 70)}%`,
    companion2: `${h2} ${Math.max(hsl.s - 5, 30)}% ${Math.max(hsl.l - 8, 30)}%`,
  }
}

function applyBrandingCSS(branding: BrandingData) {
  const root = document.documentElement
  const isDark = root.classList.contains('dark')

  const primary = deriveColors(branding.primaryColor)
  const mode = isDark ? 'dark' : 'light'

  // Hue base pro accent suave (mesma matiz, saturacao baixa)
  const baseHue = branding.primaryColor.split(' ')[0]

  // Paleta analoga derivada da primaryColor — usada pra gradientes/hovers.
  // Se o admin tiver customizado secondary/accent explicitamente (valores
  // diferentes do default), respeita esses valores. Senao, deriva da primary.
  const isSecondaryDefault = branding.secondaryColor === defaultBranding.secondaryColor
  const isAccentDefault = branding.accentColor === defaultBranding.accentColor
  const palette = deriveAnalogousPalette(branding.primaryColor)
  const companion1 = isSecondaryDefault ? palette.companion1 : branding.secondaryColor
  const companion2 = isAccentDefault ? palette.companion2 : branding.accentColor
  const secondary = deriveColors(companion1)
  const accent = deriveColors(companion2)

  // Primary color → --primary, --ring, --sidebar-primary, --brand-primary
  // Tailwind mapeia brand-primary -> var(--brand-primary). Setar nessa key.
  root.style.setProperty('--primary', primary[mode])
  root.style.setProperty('--ring', primary[mode])
  root.style.setProperty('--sidebar-primary', primary[mode])
  root.style.setProperty('--sidebar-ring', primary[mode])
  root.style.setProperty('--brand-primary', primary[mode])

  // Accent suave (background de tags, badges, hover) derivado da primary
  if (isDark) {
    root.style.setProperty('--accent', `${baseHue} 30% 12%`)
    root.style.setProperty('--accent-foreground', `${baseHue} 60% 75%`)
    root.style.setProperty('--sidebar-accent', `${baseHue} 20% 10%`)
  } else {
    root.style.setProperty('--accent', `${baseHue} 30% 94%`)
    root.style.setProperty('--accent-foreground', `${baseHue} 60% 28%`)
    root.style.setProperty('--sidebar-accent', `${baseHue} 20% 94%`)
  }

  // Companheiras analogas → brand-light / brand-deep (gradientes da auth)
  // brand-light = var(--brand-light) — companheira mais clara
  // brand-deep = var(--brand-deep)  — companheira mais escura
  root.style.setProperty('--brand-light', secondary[mode])
  root.style.setProperty('--brand-deep', accent[mode])

  // Background escuro da landing/auth — brand-surface = var(--brand-surface)
  // Hue base + tonalidade escura: mood combina com a logo em vez do preto fixo.
  root.style.setProperty('--brand-surface', `${baseHue} 35% 6%`)

  // Update favicon if set
  if (branding.faviconUrl) {
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = branding.faviconUrl
  }

  // Update document title
  if (branding.systemName) {
    const baseTitle = document.title.replace(/^[^|–-]*[|–-]\s*/, '')
    document.title = baseTitle || branding.systemName
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingData>(defaultBranding)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system-settings')
      if (res.ok) {
        const data = await res.json()
        setBranding(data)
      }
    } catch {
      // Keep defaults on error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Apply CSS variables when branding changes or theme changes
  useEffect(() => {
    if (loading) return

    applyBrandingCSS(branding)

    // Watch for theme class changes to re-apply
    const observer = new MutationObserver(() => {
      applyBrandingCSS(branding)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [branding, loading])

  return (
    <BrandingContext.Provider value={{ branding, loading, refresh }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
