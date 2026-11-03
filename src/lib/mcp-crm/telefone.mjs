/**
 * Telefone comparavel: so digitos, sem o 55 e sem o nono digito do celular.
 * O WhatsApp grava alguns DDDs sem o 9 (5562 9919-7953), e quem pergunta
 * digita com ele (62 99919-7953): os dois viram 6299197953.
 */
export function chaveTelefone(bruto) {
  let d = String(bruto || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}
