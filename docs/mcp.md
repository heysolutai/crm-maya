# MCP do CRM Maya

Servidor MCP **somente leitura** sobre a API do CRM. Serve para ler conversas e
o funil atual — o material bruto para decidir como o funil de vendas deveria ser.

Não fala com o banco: usa a API do próprio CRM com `x-api-key`, igual ao n8n.
Assim o isolamento por restaurante continua valendo onde ele já existe e é
testado; a chave pertence a uma empresa e a API só devolve o que é dela.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `listar_conversas` | Lista conversas (status, período, paginação) com prévia da última mensagem |
| `ler_conversa` | Transcrição em ordem cronológica, marcando cliente / IA / atendente |
| `listar_etapas_funil` | Etapas configuradas hoje, na ordem |
| `listar_clientes_por_etapa` | Quantos clientes em cada etapa — mostra onde a base empilha |

## Configuração

Precisa de duas variáveis de ambiente:

| Variável | Valor |
|---|---|
| `MAYA_API_URL` | Base da aplicação, ex: `https://crm.seudominio.com.br` |
| `MAYA_API_KEY` | Chave de API do restaurante (Configurações → API) |

O [`.mcp.json`](../.mcp.json) na raiz do projeto já registra o servidor lendo
essas duas variáveis do ambiente — a chave **não** fica no arquivo, que é
versionado.

Antes de abrir o Claude Code, exporte as duas:

```bash
export MAYA_API_URL="https://crm.seudominio.com.br"
export MAYA_API_KEY="rm_xxxxxxxx"
```

No PowerShell:

```powershell
$env:MAYA_API_URL = "https://crm.seudominio.com.br"
$env:MAYA_API_KEY = "rm_xxxxxxxx"
```

Instale as dependências uma vez:

```bash
cd mcp && npm install
```

## Por que é só leitura

Ler conversa para entender o que o cliente fala é uma coisa; mexer nas etapas
do funil é outra, e é decisão de quem opera. Criar ou renomear etapa continua
sendo na tela do CRM, onde existe registro de quem fez e quando.

Se um dia fizer sentido escrever por aqui, os endpoints já existem
(`POST/PUT/DELETE /api/funnel-stages`) — mas vale um passo explícito de
confirmação antes, não uma ferramenta que altera o funil sem aviso.

## Dois transportes

As ferramentas são as mesmas ([`tools.mjs`](tools.mjs)); muda só como o cliente
chega nelas.

| Arquivo | Transporte | Serve |
|---|---|---|
| `server.mjs` | stdio | Claude Code e app de desktop — roda na sua máquina |
| `http.mjs` | HTTP | claude.ai no navegador — roda no servidor |

### HTTP (claude.ai)

Imagem própria: `heysolutitsolution/crm-restaurants-mcp`. O service `mcp` no
[`docker-stack.yml`](../docker-stack.yml) já traz a configuração, atrás do
Traefik com TLS.

Três variáveis, além da porta:

| Variável | Valor |
|---|---|
| `MAYA_API_URL` | `http://app:3000` (DNS interno da overlay — não precisa sair e voltar pela internet) |
| `MAYA_API_KEY` | Chave de API do restaurante |
| `MCP_TOKEN` | Segredo que protege **este** endpoint: `openssl rand -hex 32` |

No claude.ai, adicione um conector apontando para `https://mcp.seudominio.com.br/mcp`.

O token vai no header `Authorization: Bearer <MCP_TOKEN>`. Se o cliente só
aceitar uma URL, o endpoint também reconhece o token no caminho:
`https://mcp.seudominio.com.br/mcp/<MCP_TOKEN>`.

**O caminho é o modo fraco** — URL aparece em log de proxy e em histórico.
Prefira o header quando der, e trate o token como senha: quem tem ele lê todas
as conversas do restaurante.

Rodando local para testar:

```bash
cd mcp
MAYA_API_URL=https://crm.seudominio.com.br \
MAYA_API_KEY=rm_xxxx \
MCP_TOKEN=$(openssl rand -hex 32) \
node http.mjs
```

`GET /health` responde sem token, para o healthcheck do Swarm.
