/**
 * Conexao com o Postgres VETORIAL (separado do banco principal).
 *
 * Por que um pool proprio e nao o Prisma:
 *  - pgvector exige SQL raw (operador `<=>`), que o Prisma nao expressa.
 *  - O tipo `vector` nao e suportado nativamente pelo Prisma.
 *  - Mantem o banco principal limpo: os vetores vivem em outra instancia.
 *
 * Modelo de dados: UMA TABELA POR EMPRESA, nomeada com o `knowledge_name`
 * (`know_<slug>`) — o MESMO identificador que ja vai no webhook do n8n e no
 * campo `knowledge` do AiAgent. Assim o n8n usa o nome que ja recebe.
 *
 * As colunas seguem o padrao LangChain/n8n (Postgres Vector Store):
 *   id | text | metadata | vector
 * Assim o no do n8n le/escreve sem configuracao extra de colunas.
 */
import pg from 'pg'
import { assertSafeKnowledgeName } from '@/lib/ai/knowledge-name'

let pool: pg.Pool | null = null

export function getVectorPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.VECTOR_DATABASE_URL
    if (!connectionString) {
      throw new Error('VECTOR_DATABASE_URL nao configurada')
    }
    pool = new pg.Pool({
      connectionString,
      max: parseInt(process.env.VECTOR_DB_POOL_MAX || '5'),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
    pool.on('error', (err) => {
      console.error('[VectorDB] Erro no pool:', err.message)
    })
  }
  return pool
}

export async function closeVectorPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

/** Dimensao do text-embedding-3-small (mesma do ada-002). */
export const EMBEDDING_DIMENSIONS = 1536

/**
 * Cria (se nao existir) a extensao, a tabela da base e os indices.
 * Idempotente — pode ser chamada a cada operacao sem custo relevante.
 *
 * `knowledgeName` e validado (formato `know_[a-z0-9]+`) antes de virar
 * identificador SQL, ja que nome de tabela nao pode ser parametrizado.
 */
export async function ensureFaqTable(knowledgeName: string): Promise<string> {
  const table = assertSafeKnowledgeName(knowledgeName)
  const client = await getVectorPool().connect()
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector')

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        text      TEXT NOT NULL,
        metadata  JSONB NOT NULL DEFAULT '{}'::jsonb,
        vector    vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // Indice de similaridade (cosseno) — acelera a busca semantica.
    await client.query(`
      CREATE INDEX IF NOT EXISTS "${table}_vector_idx"
      ON "${table}" USING hnsw (vector vector_cosine_ops)
    `)

    // Indice no faq_id dentro do metadata — usado pra upsert/delete por FAQ.
    await client.query(`
      CREATE INDEX IF NOT EXISTS "${table}_faq_id_idx"
      ON "${table}" ((metadata->>'faq_id'))
    `)

    return table
  } finally {
    client.release()
  }
}

/** Converte o array de floats no literal aceito pelo pgvector: "[0.1,0.2,...]". */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

export interface FaqVectorInput {
  /** Nome da base/tabela: `know_<slug>` (mesmo do webhook do n8n). */
  knowledgeName: string
  companyId: string
  faqId: string
  /** Texto que virou embedding (normalmente pergunta + resposta). */
  text: string
  embedding: number[]
  metadata?: Record<string, unknown>
}

/**
 * Insere/atualiza o vetor de UM FAQ.
 * Estrategia: apaga o registro anterior daquele faq_id e insere o novo — assim
 * a edicao de um FAQ nao deixa vetor velho (que geraria resposta desatualizada).
 */
export async function upsertFaqVector(input: FaqVectorInput): Promise<void> {
  const { knowledgeName, companyId, faqId, text, embedding, metadata = {} } = input

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding com dimensao inesperada: ${embedding.length} (esperado ${EMBEDDING_DIMENSIONS})`
    )
  }

  const table = await ensureFaqTable(knowledgeName)
  const client = await getVectorPool().connect()
  try {
    await client.query('BEGIN')
    // Filtra tambem por company_id: duas empresas com nomes que normalizam pro
    // mesmo slug compartilhariam a tabela, e sem esse filtro uma apagaria o
    // vetor da outra.
    await client.query(
      `DELETE FROM "${table}"
       WHERE metadata->>'faq_id' = $1 AND metadata->>'company_id' = $2`,
      [faqId, companyId]
    )
    await client.query(
      `INSERT INTO "${table}" (text, metadata, vector)
       VALUES ($1, $2::jsonb, $3::vector)`,
      [
        text,
        JSON.stringify({ ...metadata, faq_id: faqId, company_id: companyId }),
        toVectorLiteral(embedding),
      ]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Remove o vetor de um FAQ (usar quando o FAQ e deletado). */
export async function deleteFaqVector(
  knowledgeName: string,
  companyId: string,
  faqId: string
): Promise<void> {
  const table = assertSafeKnowledgeName(knowledgeName)
  try {
    await getVectorPool().query(
      `DELETE FROM "${table}"
       WHERE metadata->>'faq_id' = $1 AND metadata->>'company_id' = $2`,
      [faqId, companyId]
    )
  } catch (err) {
    // Tabela pode nem existir ainda (empresa sem FAQ indexado) — nao e erro.
    const msg = (err as Error).message || ''
    if (!msg.includes('does not exist')) throw err
  }
}

/**
 * Lista o que ja esta indexado: faq_id -> updated_at gravado no metadata.
 *
 * Usado pela sincronizacao incremental — com isso decidimos quem precisa de
 * embedding novo (FAQ novo ou editado) e quem pode ser pulado. Sem isso, cada
 * sync re-embeddaria tudo e pagaria OpenAI a toa.
 */
export async function listIndexedFaqs(
  knowledgeName: string,
  companyId: string
): Promise<Map<string, string>> {
  const table = assertSafeKnowledgeName(knowledgeName)
  const out = new Map<string, string>()
  try {
    const res = await getVectorPool().query(
      `SELECT metadata->>'faq_id' AS faq_id, metadata->>'updated_at' AS updated_at
       FROM "${table}"
       WHERE metadata->>'company_id' = $1`,
      [companyId]
    )
    for (const row of res.rows) {
      if (row.faq_id) out.set(row.faq_id as string, (row.updated_at as string) || '')
    }
  } catch (err) {
    const msg = (err as Error).message || ''
    // Tabela ainda nao existe = nada indexado.
    if (!msg.includes('does not exist')) throw err
  }
  return out
}

export interface FaqSearchResult {
  text: string
  metadata: Record<string, unknown>
  /** 0..1 — quanto maior, mais similar. */
  score: number
}

/** Busca semantica: retorna os FAQs mais parecidos com o embedding da pergunta. */
export async function searchFaq(
  knowledgeName: string,
  companyId: string,
  queryEmbedding: number[],
  limit = 5
): Promise<FaqSearchResult[]> {
  const table = assertSafeKnowledgeName(knowledgeName)
  try {
    // Filtro por company_id: isolamento multi-tenant mesmo que duas empresas
    // caiam no mesmo slug de tabela.
    const res = await getVectorPool().query(
      `SELECT text, metadata, 1 - (vector <=> $1::vector) AS score
       FROM "${table}"
       WHERE metadata->>'company_id' = $2
       ORDER BY vector <=> $1::vector
       LIMIT $3`,
      [toVectorLiteral(queryEmbedding), companyId, limit]
    )
    return res.rows.map((r) => ({
      text: r.text as string,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      score: Number(r.score),
    }))
  } catch (err) {
    const msg = (err as Error).message || ''
    // Empresa ainda sem tabela = sem FAQ indexado.
    if (msg.includes('does not exist')) return []
    throw err
  }
}
