/**
 * Parser de nome de produto de catálogo de motos.
 *
 * Extrai marca, cilindrada e ano a partir do nome do produto,
 * assumindo o padrão usado no catálogo do WhatsApp Business.
 *
 * Exemplos:
 *   "Honda CG 160 Titan 2021/2022"       → { brand: "Honda", cc: 160, year: "2021/2022" }
 *   "Bajaj Dominar 250 2025"              → { brand: "Bajaj", cc: 250, year: "2025" }
 *   "Royal Enfield Himalayan 450 ABS 25/26" → { brand: "Royal Enfield", cc: 450, year: "25/26" }
 *   "Suzuki DL Vstrom 1000 2007/2007"    → { brand: "Suzuki", cc: 1000, year: "2007/2007" }
 */

export interface ParsedProduct {
  brand: string | null;
  displacementCc: number | null;
  vehicleYear: string | null;
}

// Marcas conhecidas — a ordem importa: multi-palavras ANTES das com uma palavra
const KNOWN_BRANDS = [
  "Royal Enfield",
  "Harley Davidson",
  "Harley-Davidson",
  "Moto Guzzi",
  "Honda",
  "Yamaha",
  "Suzuki",
  "Kawasaki",
  "Bajaj",
  "BMW",
  "KTM",
  "Ducati",
  "Triumph",
  "Indian",
  "Husqvarna",
  "Aprilia",
  "Piaggio",
  "Shineray",
  "Haojue",
  "Dafra",
  "Traxx",
  "Sundown",
  "MV Agusta",
  "CFMoto",
  "Benelli",
];

/** Normaliza espaços e capitaliza marca corretamente. */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Extrai a marca do início do nome. Case-insensitive, retorna no formato original conhecido. */
function extractBrand(name: string): string | null {
  const lower = name.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  return null;
}

/**
 * Extrai a cilindrada.
 *
 * Procura por um número entre 50 e 2500 que NÃO seja ano (não começa com 19/20
 * e não tem 4 dígitos em geral). Ignora números coladas a "km" ou "cv".
 *
 * Faixa típica de motos: 50cc (cub) até ~2500cc (maxi trail).
 */
function extractDisplacement(name: string): number | null {
  // Primeiro procura padrão explícito "XXXcc" ou "XXX cc"
  const explicit = name.match(/(\d{2,4})\s*cc\b/i);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (n >= 50 && n <= 2500) return n;
  }

  // Procura números soltos que façam sentido como cilindrada
  // Remove anos (4 dígitos começando com 19 ou 20) e "25/26", "2021/2022", etc.
  const sanitized = name
    .replace(/\b(19|20)\d{2}(?:\s*\/\s*(?:19|20)?\d{2})?\b/g, " ") // anos completos
    .replace(/\b\d{2}\s*\/\s*\d{2}\b/g, " "); // anos curtos tipo 25/26

  const numbers = sanitized.match(/\b\d{2,4}\b/g);
  if (!numbers) return null;

  // Retorna o primeiro número dentro da faixa plausível (motos: 50-2500cc)
  for (const n of numbers) {
    const num = parseInt(n, 10);
    if (num >= 50 && num <= 2500) return num;
  }

  return null;
}

/**
 * Extrai ano/modelo.
 *
 * Procura no FINAL do nome padrões como:
 *   - "2021/2022", "25/26", "2007/2007"
 *   - "2025", "2024"
 */
function extractYear(name: string): string | null {
  // Tenta primeiro "ano/ano" (mais específico, maior prioridade)
  const yearRange = name.match(/\b((?:19|20)?\d{2}\s*\/\s*(?:19|20)?\d{2})\b/);
  if (yearRange) return normalize(yearRange[1].replace(/\s/g, ""));

  // Depois tenta ano simples (4 dígitos começando com 19 ou 20)
  const singleYear = name.match(/\b((?:19|20)\d{2})\b/);
  if (singleYear) return singleYear[1];

  return null;
}

/**
 * Parser principal. Combina os extratores acima.
 */
export function parseProductName(name: string): ParsedProduct {
  if (!name) return { brand: null, displacementCc: null, vehicleYear: null };

  const clean = normalize(name);
  return {
    brand: extractBrand(clean),
    displacementCc: extractDisplacement(clean),
    vehicleYear: extractYear(clean),
  };
}
