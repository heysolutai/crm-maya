# Imagem do MCP do CRM Maya (transporte HTTP).
#
# Separada da imagem do CRM de proposito: e um servico de leitura que fica
# exposto pra fora e nao precisa do Next.js, do Prisma nem do ffmpeg junto.
# Menos coisa na imagem, menos superficie.
#
# Contexto de build e a PASTA mcp/, nao a raiz do projeto:
#   docker build -t <imagem> ./mcp
FROM node:22-alpine

WORKDIR /app

# Dependencias primeiro: mexer no codigo nao invalida esta camada.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY tools.mjs http.mjs server.mjs ./

# Nao roda como root: o processo so precisa abrir uma porta e falar HTTP.
RUN addgroup --system --gid 1001 mcp && adduser --system --uid 1001 mcp
USER mcp

ENV MCP_PORT=8080
EXPOSE 8080

# Sem shell no meio: o sinal do Docker chega direto no node.
CMD ["node", "http.mjs"]
