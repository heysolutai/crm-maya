export function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Normaliza o nome da empresa para uso como sufixo em nomes de tabela
 * de conhecimento da IA. Remove acentos, espaços, hifens e tudo que não
 * for alfanumérico, convertendo para lowercase.
 *
 * Ex: "2M Motos" → "2mmotos", "João & Cia" → "joaocia"
 */
export function normalizeCompanySlug(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Gera as variações válidas de um número brasileiro para matching.
 *
 * Regra específica do Brasil:
 *   - DDD ≤ 28 (ex: 11 São Paulo, 21 RJ, 27 ES): o 9 é obrigatório, sempre está
 *     presente no JID do WhatsApp. Não gera variações.
 *   - DDD > 28 (ex: 62 GO, 85 CE, 91 PA): o WhatsApp pode entregar sem o 9
 *     (JID antigo). Nesses casos gera as duas variações (com e sem 9).
 *
 * Exemplos:
 *   DDD 62 (> 28):
 *     "556291873663"  → ["556291873663", "5562991873663", "6291873663", "62991873663"]
 *     "5562991873663" → ["5562991873663", "556291873663", "62991873663", "6291873663"]
 *
 *   DDD 11 (≤ 28):
 *     "5511999887766" → ["5511999887766", "11999887766"]   (sem variações — só normaliza)
 */
export function phoneVariants(phone: string): string[] {
  const digits = cleanPhone(phone);
  if (!digits) return [];

  const variants = new Set<string>([digits]);

  // Strip country code 55 se presente para análise do núcleo (DDD + número)
  let core = digits;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    core = digits.substring(2);
  }

  // core deve ter: DDD(2) + número(8 ou 9)
  if (core.length === 10 || core.length === 11) {
    const ddd = parseInt(core.substring(0, 2), 10);
    const dddStr = core.substring(0, 2);
    const rest = core.substring(2);

    const variantsCore: string[] = [core];

    // Só gera variações "com/sem 9" para DDD > 28
    if (ddd > 28) {
      if (rest.length === 9 && rest[0] === '9') {
        // Celular COM 9 — gera variação SEM 9
        variantsCore.push(dddStr + rest.substring(1));
      } else if (rest.length === 8 && /^[6-9]/.test(rest)) {
        // Celular SEM 9 — gera variação COM 9
        variantsCore.push(dddStr + '9' + rest);
      }
    }

    for (const v of variantsCore) {
      variants.add(v);          // sem código de país
      variants.add('55' + v);   // com código de país
    }
  }

  return Array.from(variants);
}

/**
 * Retorna a forma canônica (preferida) do número brasileiro para salvar no DB.
 *
 * Regra:
 *   - Sempre com código de país 55 + DDD + número.
 *   - DDD ≤ 28: preserva exatamente como veio (o 9 é obrigatório e imutável).
 *   - DDD > 28: garante o 9 na frente quando for celular (dígito inicial 6-9).
 */
export function canonicalPhone(phone: string): string {
  const digits = cleanPhone(phone);
  if (!digits) return '';

  let core = digits;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    core = digits.substring(2);
  }

  if (core.length === 10 || core.length === 11) {
    const ddd = parseInt(core.substring(0, 2), 10);
    const dddStr = core.substring(0, 2);
    const rest = core.substring(2);

    // DDD > 28: normaliza sempre adicionando o 9 se não tiver
    if (ddd > 28 && rest.length === 8 && /^[6-9]/.test(rest)) {
      return '55' + dddStr + '9' + rest;
    }

    // Demais casos (DDD ≤ 28 ou já tem 9): mantém como está, só garante o 55
    return '55' + core;
  }

  return digits;
}

export function validateTextPayload(payload: any): void {
  if (!payload.phone) {
    throw new Error('phone is required');
  }
  if (!payload.message) {
    throw new Error('message is required');
  }
}

export function validateMediaPayload(payload: any): void {
  if (!payload.phone) {
    throw new Error('phone is required');
  }
  if (!payload.type) {
    throw new Error('type is required (image, video, document, audio, myaudio, ptt, sticker)');
  }
  if (!payload.file) {
    throw new Error('file is required (URL or base64)');
  }
  const validTypes = ['image', 'video', 'document', 'audio', 'myaudio', 'ptt', 'sticker'];
  if (!validTypes.includes(payload.type)) {
    throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
  }
}
