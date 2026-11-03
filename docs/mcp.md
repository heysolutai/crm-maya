# MCP do CRM Maya

Servidor MCP dentro do próprio CRM, em `POST /api/mcp`. Serve para ler
conversas e o funil, e para **auditar se a IA segue o prompt** do agente — e
ajustar o prompt quando não segue.

Não há imagem nem serviço à parte: sobe junto com o app. O código fica em
[`src/lib/mcp-crm/tools.mjs`](../src/lib/mcp-crm/tools.mjs) (ferramentas) e
[`src/app/api/mcp/route.ts`](../src/app/api/mcp/route.ts) (endpoint).

## Acesso

A **chave de API do restaurante** (Configurações → API) é o acesso. Vai no
header `x-api-key` ou `Authorization: Bearer <chave>`.

O MCP enxerga e altera só o que essa chave já alcança pela API: as ferramentas
chamam a própria API do CRM (pelo loopback) com a mesma chave, então o
isolamento por restaurante continua nas rotas de sempre. Um restaurante por
chave; para outro restaurante, outra entrada no cliente com a outra chave.

Trate a chave como senha: quem tem ela lê as conversas do restaurante e muda o
prompt da IA.

### Super-admin (todos os restaurantes)

No lugar da chave, um token do super-admin, configurado nas variáveis do app
(Portainer). Gere cada um com `openssl rand -hex 32` (mínimo 32 caracteres;
mais curto, o modo fica desligado):

| Variável | Acesso |
|---|---|
| `MCP_ADMIN_TOKEN` | Completo: todos os restaurantes, lê e altera o prompt |
| `MCP_ADMIN_TOKEN_LEITURA` | Só leitura: `alterar_prompt` e `restaurar_prompt` nem aparecem. Para um Hermes que acompanha o WhatsApp de suporte |

O de leitura depende do completo estar configurado (as ferramentas chamam a
API internamente com ele).

Nesse modo cada ferramenta ganha `restaurante_id`, mas quase nunca precisa: o
restaurante sai do `agente_id`, da `conversa_id` ou do telefone do cliente.
Se o telefone for cliente de mais de um restaurante, a ferramenta lista os
restaurantes e pede o `restaurante_id`. Toda resposta começa com
`Restaurante: <nome>`. Duas ferramentas a mais:

| Ferramenta | O que faz |
|---|---|
| `buscar_telefone` | Onde o telefone aparece em todos os restaurantes: cliente, WhatsApp do restaurante ou usuário da equipe |
| `listar_restaurantes` | Restaurantes com id e os WhatsApps de cada um |

Os tokens valem por qualquer restaurante: guarde como senha de super-admin.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `listar_conversas` | Lista conversas (status, período, conexão, paginação) com prévia da última mensagem |
| `ler_conversa` | Transcrição por id ou **telefone**, marcando cliente / IA / atendente e as ferramentas que a IA usou (com o resultado) |
| `listar_etapas_funil` | Etapas configuradas hoje, na ordem |
| `listar_clientes_por_etapa` | Quantos clientes em cada etapa — mostra onde a base empilha |
| `listar_agentes` | Agentes de IA, as conexões que cada um atende e o motor |
| `ver_prompt` | Prompt do agente, marca de versão e histórico de trocas (e o texto de uma versão anterior) |
| `auditar_conversas` | Prompt + as conversas recentes em que a IA respondeu (ou só as de um **telefone**), marcando as que rodaram com versão anterior |
| `alterar_prompt` | **Escreve.** Troca um trecho (`trocar`/`por`) ou o prompt inteiro |
| `restaurar_prompt` | **Escreve.** Volta para uma versão do histórico |

O telefone vale com ou sem 55, com ou sem o 9 e com qualquer pontuação: o
WhatsApp grava alguns DDDs sem o 9, e a busca acha dos dois jeitos.

### Auditar o prompt

Peça algo como *"lê a conversa do 62999197953 e vê onde o prompt errou"* ou
*"audita as últimas 10 conversas da IA contra o prompt"*. O
`auditar_conversas` traz o prompt e as transcrições; quem analisa é o modelo
do cliente MCP, regra por regra, citando conversa e horário. As ferramentas
aparecem no meio da conversa, então dá para pegar o caso clássico: a
ferramenta falhou e a IA disse ao cliente que a reserva estava confirmada.

Com o motor `maestro`, o CRM soma ao prompt regras fixas de WhatsApp e o
roteiro das ferramentas — o que vem delas não é culpa do prompt.

## O que escreve (e as travas)

Só o prompt do agente, pela rota `/api/ai-configurations/prompt`. Funil,
clientes e conversas continuam só leitura.

- **Versão:** `alterar_prompt` exige a marca que o `ver_prompt` mostrou. Se
  alguém salvou o prompt pela tela no meio, a troca é recusada em vez de
  apagar o texto dela.
- **Trecho único:** em `trocar`/`por`, o trecho precisa aparecer exatamente
  uma vez no texto atual.
- **Motivo obrigatório** e **histórico:** o texto que valia vai para
  `prompts.historico` do agente (últimas 10 versões, com data, origem e
  motivo). A tela também registra as trocas dela ali. `restaurar_prompt` volta
  qualquer uma.
- Prompt com menos de 50 caracteres é recusado (o mesmo mínimo da tela).

As duas ferramentas de escrita vão marcadas como destrutivas, para o cliente
pedir confirmação antes de chamar.

## Conectar

### Hermes (`~/.hermes/config.yaml`)

```yaml
mcp_servers:
  maya_crm:
    url: "https://crm.seudominio.com.br/api/mcp"
    headers:
      x-api-key: "rm_xxxxxxxx"
    timeout: 180
```

Depois, `/reload-mcp` no Hermes. O `timeout` maior é para a auditoria, que lê
várias conversas de uma vez.

Super-admin: o mesmo, com `Authorization: "Bearer <MCP_ADMIN_TOKEN>"` no lugar
do `x-api-key` (ou o `MCP_ADMIN_TOKEN_LEITURA`, no perfil que lê o suporte).

### Claude Code

O [`.mcp.json`](../.mcp.json) na raiz já registra o servidor lendo
`MAYA_API_URL` e `MAYA_API_KEY` do ambiente — a chave **não** fica no arquivo,
que é versionado:

```powershell
setx MAYA_API_URL "https://crm.seudominio.com.br"
setx MAYA_API_KEY "rm_xxxxxxxx"
```

Reabra o VS Code depois do `setx`. Para um segundo restaurante ao mesmo tempo:

```powershell
claude mcp add maya-outro --scope local --transport http https://crm.seudominio.com.br/api/mcp --header "x-api-key: rm_chave_do_outro"
```
