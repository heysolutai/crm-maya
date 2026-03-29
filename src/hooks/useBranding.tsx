'use client'

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
  systemName: 'MiletoIA',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '150 80% 36%',
  secondaryColor: '170 70% 35%',
  accentColor: '175 60% 32%',
  loginDescription: null,
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

/** Derive light/dark HSL variants from a base HSL string */
function deriveColors(base: string): { light: string; dark: string } {
  // base is like "150 80% 36%"
  const parts = base.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
  if (!parts) return { light: base, dark: base }
  const h = parseFloat(parts[1])
  const s = parseFloat(parts[2])
  const l = parseFloat(parts[3])
  return {
    light: `${h} ${s}% ${l}%`,
    dark: `${h} ${s}% ${Math.min(l + 9, 60)}%`,
  }
}

function applyBrandingCSS(branding: BrandingData) {
  const root = document.documentElement
  const isDark = root.classList.contains('dark')

  const primary = deriveColors(branding.primaryColor)
  const secondary = deriveColors(branding.secondaryColor)
  const accent = deriveColors(branding.accentColor)

  const mode = isDark ? 'dark' : 'light'

  // Primary color → --primary, --ring, --sidebar-primary, --mileto-green
  root.style.setProperty('--primary', primary[mode])
  root.style.setProperty('--ring', primary[mode])
  root.style.setProperty('--sidebar-primary', primary[mode])
  root.style.setProperty('--sidebar-ring', primary[mode])
  root.style.setProperty('--mileto-green', primary[mode])

  // Accent derived from primary
  if (isDark) {
    root.style.setProperty('--accent', `${branding.primaryColor.split(' ')[0]} 30% 12%`)
    root.style.setProperty('--accent-foreground', `${branding.primaryColor.split(' ')[0]} 60% 75%`)
    root.style.setProperty('--sidebar-accent', `${branding.primaryColor.split(' ')[0]} 20% 10%`)
  } else {
    root.style.setProperty('--accent', `${branding.primaryColor.split(' ')[0]} 30% 94%`)
    root.style.setProperty('--accent-foreground', `${branding.primaryColor.split(' ')[0]} 60% 28%`)
    root.style.setProperty('--sidebar-accent', `${branding.primaryColor.split(' ')[0]} 20% 94%`)
  }

  // Secondary → --mileto-cyan
  root.style.setProperty('--mileto-cyan', secondary[mode])

  // Accent color → --mileto-blue
  root.style.setProperty('--mileto-blue', accent[mode])

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
      const res = await fetch('/api/system-settings')
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
