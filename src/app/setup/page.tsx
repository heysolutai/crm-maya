'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, Loader2, Server, User, Building2, ArrowRight, Shield } from 'lucide-react'

type Step = 'checking' | 'welcome' | 'admin' | 'company' | 'done'

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('checking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dbError, setDbError] = useState(false)

  const [adminData, setAdminData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const [companyData, setCompanyData] = useState({
    companyName: '',
    companyEmail: '',
  })

  const [result, setResult] = useState<any>(null)

  // Check if setup is needed
  useEffect(() => {
    fetch('/api/setup')
      .then(res => res.json())
      .then(data => {
        if (data.dbError) {
          setDbError(true)
          setStep('welcome')
        } else if (!data.needsSetup) {
          router.replace('/auth')
        } else {
          setStep('welcome')
        }
      })
      .catch(() => {
        setDbError(true)
        setStep('welcome')
      })
  }, [router])

  const handleCreateAdmin = async () => {
    setError('')

    if (!adminData.fullName || !adminData.email || !adminData.password) {
      setError('Preencha todos os campos')
      return
    }
    if (adminData.password.length < 6) {
      setError('A senha deve ter no minimo 6 caracteres')
      return
    }
    if (adminData.password !== adminData.confirmPassword) {
      setError('As senhas nao coincidem')
      return
    }

    setStep('company')
  }

  const handleFinish = async (skipCompany: boolean) => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...adminData,
          ...(skipCompany ? {} : companyData),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao configurar')
        setLoading(false)
        return
      }

      setResult(data)
      setStep('done')
    } catch (err: any) {
      setError(err.message || 'Erro de conexao')
    }

    setLoading(false)
  }

  if (step === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Verificando sistema...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['welcome', 'admin', 'company', 'done'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full transition-colors ${
                step === s ? 'bg-primary scale-125' :
                ['welcome', 'admin', 'company', 'done'].indexOf(step) > i ? 'bg-primary' : 'bg-muted'
              }`} />
              {i < 3 && <div className={`h-0.5 w-8 transition-colors ${
                ['welcome', 'admin', 'company', 'done'].indexOf(step) > i ? 'bg-primary' : 'bg-muted'
              }`} />}
            </div>
          ))}
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 rounded-full p-4 mb-4 w-fit">
                <Server className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Bem-vindo ao CRM Maya</CardTitle>
              <CardDescription className="text-base">
                Vamos configurar o sistema pela primeira vez
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dbError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-sm text-destructive font-medium">Banco de dados nao acessivel</p>
                  <p className="text-xs text-destructive/80 mt-1">
                    Verifique se o PostgreSQL esta rodando e o DATABASE_URL esta correto no .env
                  </p>
                </div>
              )}

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Criar Super Admin</p>
                    <p>A conta com acesso total ao sistema</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Criar Primeira Empresa</p>
                    <p>Com funil de vendas padrao ja configurado</p>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => setStep('admin')}
                disabled={dbError}
              >
                Comecar Configuracao
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Admin */}
        {step === 'admin' && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 rounded-full p-4 mb-4 w-fit">
                <User className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Criar Super Admin</CardTitle>
              <CardDescription>Essa sera a conta principal do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <Input
                  id="fullName"
                  placeholder="Seu nome completo"
                  value={adminData.fullName}
                  onChange={e => setAdminData(d => ({ ...d, fullName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@seudominio.com.br"
                  value={adminData.email}
                  onChange={e => setAdminData(d => ({ ...d, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 6 caracteres"
                  value={adminData.password}
                  onChange={e => setAdminData(d => ({ ...d, password: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a senha"
                  value={adminData.confirmPassword}
                  onChange={e => setAdminData(d => ({ ...d, confirmPassword: e.target.value }))}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button className="w-full" size="lg" onClick={handleCreateAdmin}>
                Proximo: Empresa
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Company */}
        {step === 'company' && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 rounded-full p-4 mb-4 w-fit">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Primeira Empresa</CardTitle>
              <CardDescription>Crie a empresa principal ou pule para depois</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da Empresa</Label>
                <Input
                  id="companyName"
                  placeholder="Ex: Otica Exemplo"
                  value={companyData.companyName}
                  onChange={e => setCompanyData(d => ({ ...d, companyName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyEmail">Email da Empresa</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  placeholder="contato@empresa.com.br"
                  value={companyData.companyEmail}
                  onChange={e => setCompanyData(d => ({ ...d, companyEmail: e.target.value }))}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  size="lg"
                  onClick={() => handleFinish(true)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pular'}
                </Button>
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={() => handleFinish(false)}
                  disabled={loading || !companyData.companyName}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      Finalizar
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Done */}
        {step === 'done' && result && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-emerald-500/10 rounded-full p-4 mb-4 w-fit">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
              <CardTitle className="text-xl">Sistema Configurado!</CardTitle>
              <CardDescription>Tudo pronto para usar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin</span>
                  <span className="font-medium">{result.user.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{result.user.email}</span>
                </div>
                {result.company && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Empresa</span>
                    <span className="font-medium">{result.company.name}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium text-primary">Super Admin</span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => router.push('/auth')}
              >
                Ir para Login
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
