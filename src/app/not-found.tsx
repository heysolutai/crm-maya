import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <p className="text-xl text-muted-foreground">Página não encontrada</p>
        <Link
          href="/"
          className="inline-block px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
