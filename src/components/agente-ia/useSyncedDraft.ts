'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Rascunho de formulário que acompanha o que está salvo no servidor.
 *
 * - Enquanto a pessoa não mexeu em nada, o rascunho segue o servidor (por
 *   exemplo, depois de salvar ou quando o suporte muda algo em outra tela).
 * - Se ela já começou a editar, o rascunho dela é mantido: nada é apagado
 *   por uma atualização que chegou no meio da digitação.
 *
 * Devolve [rascunho, setRascunho, alterado].
 */
export function useSyncedDraft<T>(server: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [draft, setDraft] = useState<T>(server);
  const baseRef = useRef<string>(JSON.stringify(server));

  useEffect(() => {
    const assinatura = JSON.stringify(server);
    if (assinatura === baseRef.current) return;
    const anterior = baseRef.current;
    baseRef.current = assinatura;
    setDraft((atual) => (JSON.stringify(atual) === anterior ? server : atual));
  }, [server]);

  // "Alterado" = difere do servidor E não é só o valor antigo que está prestes a
  // ser trocado pelo novo (no render em que o servidor acabou de mudar).
  const assinaturaDraft = JSON.stringify(draft);
  const alterado = assinaturaDraft !== JSON.stringify(server) && assinaturaDraft !== baseRef.current;
  return [draft, setDraft, alterado];
}
