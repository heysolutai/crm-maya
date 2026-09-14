import {
  desescaparQuebras,
  markdownParaWhatsApp,
  prepararTextoParaWhatsApp,
  textoPlano,
  tokenizarWhatsApp,
  type Trecho,
} from '@/lib/whatsapp/texto-whatsapp'

describe('textoPlano', () => {
  it('tira marcadores e junta linhas pra previa', () => {
    expect(textoPlano('**Oi**\\nTudo _bem_?\n\n~ok~')).toBe('Oi Tudo bem? ok')
  })
})

const tipos = (t: Trecho[]) => t.map((x) => x.tipo)
const textoDe = (t: Trecho): string =>
  t.tipo === 'texto' || t.tipo === 'bloco' ? t.valor : t.filhos.map(textoDe).join('')

describe('desescaparQuebras', () => {
  it('converte "\\n" literal em quebra real', () => {
    expect(desescaparQuebras('Oi\\nTudo bem?')).toBe('Oi\nTudo bem?')
  })
  it('converte CRLF e "\\r\\n" literal', () => {
    expect(desescaparQuebras('a\r\nb\\r\\nc')).toBe('a\nb\nc')
  })
  it('nao deixa barra sobrando quando veio escapado duas vezes', () => {
    expect(desescaparQuebras('a\\\\nb')).toBe('a\nb')
  })
  it('mantem quebra real', () => {
    expect(desescaparQuebras('a\nb')).toBe('a\nb')
  })
})

describe('markdownParaWhatsApp', () => {
  it('**negrito** vira *negrito*', () => {
    expect(markdownParaWhatsApp('Oi **Yago**, tudo bem?')).toBe('Oi *Yago*, tudo bem?')
  })
  it('__negrito__ vira *negrito*', () => {
    expect(markdownParaWhatsApp('__forte__')).toBe('*forte*')
  })
  it('~~riscado~~ vira ~riscado~', () => {
    expect(markdownParaWhatsApp('~~antigo~~')).toBe('~antigo~')
  })
  it('titulo markdown vira linha em negrito', () => {
    expect(markdownParaWhatsApp('## Horarios\nSeg a sex')).toBe('*Horarios*\nSeg a sex')
  })
  it('link markdown vira texto (url)', () => {
    expect(markdownParaWhatsApp('Veja [o site](https://ex.com/a)')).toBe('Veja o site (https://ex.com/a)')
  })
  it('item de lista com asterisco vira traco', () => {
    expect(markdownParaWhatsApp('* um\n* dois')).toBe('- um\n- dois')
  })
  it('nao mexe em *x* e _x_ simples (ja sao WhatsApp)', () => {
    expect(markdownParaWhatsApp('*a* e _b_')).toBe('*a* e _b_')
  })
  it('nao junta negritos separados na mesma linha', () => {
    expect(markdownParaWhatsApp('**a** e **b**')).toBe('*a* e *b*')
  })
  it('prepararTextoParaWhatsApp combina tudo', () => {
    expect(prepararTextoParaWhatsApp('**Oi**\\nTchau')).toBe('*Oi*\nTchau')
    expect(prepararTextoParaWhatsApp('')).toBe('')
  })
})

describe('tokenizarWhatsApp', () => {
  it('reconhece negrito, italico, riscado e mono', () => {
    const t = tokenizarWhatsApp('*a* _b_ ~c~ `d`')
    expect(tipos(t)).toEqual(['negrito', 'texto', 'italico', 'texto', 'riscado', 'texto', 'mono'])
    expect(t.map(textoDe)).toEqual(['a', ' ', 'b', ' ', 'c', ' ', 'd'])
  })
  it('aninha italico dentro de negrito', () => {
    const t = tokenizarWhatsApp('*oi _voce_*')
    expect(t).toHaveLength(1)
    expect(t[0].tipo).toBe('negrito')
    expect(tipos((t[0] as { filhos: Trecho[] }).filhos)).toEqual(['texto', 'italico'])
  })
  it('asterisco de multiplicacao e underline de identificador ficam texto', () => {
    expect(tipos(tokenizarWhatsApp('2 * 3 * 4'))).toEqual(['texto'])
    expect(tipos(tokenizarWhatsApp('snake_case_nome e a_b@c.com'))).toEqual(['texto'])
    expect(tipos(tokenizarWhatsApp('a*b*c'))).toEqual(['texto'])
  })
  it('marcador nao atravessa linha', () => {
    expect(tipos(tokenizarWhatsApp('*abre\nfecha*'))).toEqual(['texto'])
  })
  it('bloco de codigo com tres crases', () => {
    const t = tokenizarWhatsApp('antes ```x = 1\ny = 2``` depois')
    expect(tipos(t)).toEqual(['texto', 'bloco', 'texto'])
    expect(textoDe(t[1])).toBe('x = 1\ny = 2')
  })
  it('mensagem antiga da IA com **x** e \\n literal renderiza certo', () => {
    const t = tokenizarWhatsApp('**Oi**\\nTudo bem?')
    expect(tipos(t)).toEqual(['negrito', 'texto'])
    expect(textoDe(t[1])).toBe('\nTudo bem?')
  })
  it('marcador sem par fica como texto', () => {
    expect(tokenizarWhatsApp('preco *promocional').map(textoDe).join('')).toBe('preco *promocional')
  })
})
