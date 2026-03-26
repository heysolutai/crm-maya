'use client'

import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

type AppRole = 'super_admin' | 'company_admin' | 'manager' | 'agent' | 'viewer';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isFetchingRoleRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] Event:', event);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          console.log('[Auth] User logged in, fetching role...');
          if (!isFetchingRoleRef.current) {
            isFetchingRoleRef.current = true;
            fetchUserRole(session.user.id);
          }
        } else {
          setRole(null);
          setCompanyId(null);
          setLoading(false);
          isFetchingRoleRef.current = false;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      console.log('[Auth] Fetching roles for user:', userId);

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role, company_id')
        .eq('user_id', userId);

      console.log('[Auth] Roles fetched:', roles);

      if (rolesError) {
        console.error('[Auth] Error fetching roles:', rolesError);
        isFetchingRoleRef.current = false;
        throw rolesError;
      }

      if (roles && roles.length > 0) {
        const superAdminRole = roles.find(r => r.role === 'super_admin');
        const companyRole = roles.find(r => r.company_id);

        if (superAdminRole) {
          console.log('[Auth] User is super_admin');
          setRole('super_admin');
          setCompanyId(companyRole?.company_id || null);
          setLoading(false);
          isFetchingRoleRef.current = false;
          return;
        }

        if (companyRole) {
          console.log('[Auth] User has company role:', companyRole.role);
          setRole(companyRole.role as AppRole);
          setCompanyId(companyRole.company_id);
          setLoading(false);
          isFetchingRoleRef.current = false;
          return;
        }
      }

      console.warn('[Auth] No roles found for user');
      setLoading(false);
      isFetchingRoleRef.current = false;
    } catch (error) {
      console.error('[Auth] Error in fetchUserRole:', error);
      setLoading(false);
      isFetchingRoleRef.current = false;
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : '/';

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setCompanyId(null);
  };

  const isSuperAdmin = role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        companyId,
        isSuperAdmin,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
