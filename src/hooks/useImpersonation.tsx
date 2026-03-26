'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

const STORAGE_KEY = 'impersonation_state';

interface ImpersonationState {
  companyId: string;
  companyName: string;
}

interface ImpersonationContextType {
  impersonatedCompanyId: string | null;
  impersonatedCompanyName: string | null;
  isImpersonating: boolean;
  startImpersonation: (companyId: string, companyName: string) => void;
  stopImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const getStoredState = (): ImpersonationState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
};

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [impersonatedCompanyId, setImpersonatedCompanyId] = useState<string | null>(() => {
    const stored = getStoredState();
    return stored?.companyId ?? null;
  });

  const [impersonatedCompanyName, setImpersonatedCompanyName] = useState<string | null>(() => {
    const stored = getStoredState();
    return stored?.companyName ?? null;
  });

  const startImpersonation = useCallback((companyId: string, companyName: string) => {
    setImpersonatedCompanyId(companyId);
    setImpersonatedCompanyName(companyName);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ companyId, companyName }));
  }, []);

  const stopImpersonation = useCallback(() => {
    setImpersonatedCompanyId(null);
    setImpersonatedCompanyName(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const isImpersonating = impersonatedCompanyId !== null;

  return (
    <ImpersonationContext.Provider
      value={{
        impersonatedCompanyId,
        impersonatedCompanyName,
        isImpersonating,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}
