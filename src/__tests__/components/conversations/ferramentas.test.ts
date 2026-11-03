import { intercalarFerramentas, type ChamadaFerramenta } from '@/components/conversations/ferramentas'

const msg = (id: string, hora: string) => ({ id, created_at: `2026-10-29T${hora}:00.000Z` })
const chamada = (id: string, hora: string): ChamadaFerramenta => ({
  id,
  toolName: id,
  label: id,
  ok: true,
  arguments: {},
  createdAt: `2026-10-29T${hora}:00.000Z`,
})
const ids = (itens: { id: string }[]) => itens.map((i) => i.id)

describe('intercalarFerramentas', () => {
  it('coloca a ferramenta entre a mensagem do cliente e a resposta da IA', () => {
    const itens = intercalarFerramentas([msg('cliente', '20:00'), msg('ia', '20:02')], [chamada('t1', '20:01')], false)
    expect(ids(itens)).toEqual(['cliente', 'ferramentas:t1', 'ia'])
  })

  it('junta ferramentas seguidas numa linha so', () => {
    const itens = intercalarFerramentas(
      [msg('cliente', '20:00'), msg('ia', '20:05')],
      [chamada('t1', '20:01'), chamada('t2', '20:02')],
      false
    )
    expect(ids(itens)).toEqual(['cliente', 'ferramentas:t1', 'ia'])
    expect(itens[1]).toMatchObject({ _isFerramentas: true, chamadas: [{ id: 't1' }, { id: 't2' }] })
  })

  it('ferramenta depois da ultima mensagem fica no fim (a resposta ainda nao saiu)', () => {
    const itens = intercalarFerramentas([msg('cliente', '20:00')], [chamada('t1', '20:01')], false)
    expect(ids(itens)).toEqual(['cliente', 'ferramentas:t1'])
  })

  it('com mensagens antigas por carregar, esconde ferramentas de antes do trecho carregado', () => {
    const itens = intercalarFerramentas([msg('a', '20:00'), msg('b', '20:10')], [chamada('velha', '19:00'), chamada('t1', '20:05')], true)
    expect(ids(itens)).toEqual(['a', 'ferramentas:t1', 'b'])
  })

  it('sem ferramentas devolve a mesma lista (nao quebra o memo)', () => {
    const mensagens = [msg('a', '20:00')]
    expect(intercalarFerramentas(mensagens, [], false)).toBe(mensagens)
    expect(intercalarFerramentas(mensagens, undefined, false)).toBe(mensagens)
  })
})
