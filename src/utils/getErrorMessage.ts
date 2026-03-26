// Função utilitária para traduzir erros técnicos em mensagens amigáveis em português
export const getErrorMessage = (error: any): string => {
  const message = (error?.message || error?.error || String(error || '')).toLowerCase();

  // Conexão / rede
  if (message.includes('connection') || message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
    return 'Problema de conexão. Verifique sua internet e tente novamente.';
  }

  // WhatsApp
  if (message.includes('whatsapp') && (message.includes('disconnected') || message.includes('not connected'))) {
    return 'WhatsApp desconectado. Por favor, reconecte na área de configurações.';
  }
  if (message.includes('instance') && message.includes('not found')) {
    return 'Instância WhatsApp não encontrada. Verifique as configurações.';
  }
  if (message.includes('qr') || message.includes('qrcode')) {
    return 'Erro ao gerar QR Code. Tente novamente em alguns segundos.';
  }

  // Telefone
  if (message.includes('phone') || message.includes('number')) {
    return 'Número de telefone inválido ou não encontrado.';
  }

  // Timeout
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'A operação demorou muito. Tente novamente.';
  }

  // Autenticação / Permissão
  if (message.includes('permission') || message.includes('unauthorized') || message.includes('403')) {
    return 'Você não tem permissão para esta ação.';
  }
  if (message.includes('401') || message.includes('authentication') || message.includes('not authenticated') || message.includes('session')) {
    return 'Sessão expirada. Faça login novamente.';
  }

  // Usuário já existe
  if (message.includes('already') && (message.includes('exist') || message.includes('registered'))) {
    return 'Este usuário já está cadastrado no sistema.';
  }
  if (message.includes('duplicate') || message.includes('unique') || message.includes('already exists')) {
    return 'Este registro já existe. Verifique os dados e tente novamente.';
  }

  // Email inválido
  if (message.includes('email') && (message.includes('invalid') || message.includes('inválido'))) {
    return 'O email informado é inválido. Verifique e tente novamente.';
  }

  // Senha
  if (message.includes('password') || message.includes('senha')) {
    return 'Erro com a senha. A senha deve ter no mínimo 6 caracteres.';
  }

  // Not found
  if (message.includes('not found') || message.includes('404')) {
    return 'Recurso não encontrado. Atualize a página e tente novamente.';
  }

  // Arquivo / Upload
  if (message.includes('file') || message.includes('upload')) {
    return 'Erro ao processar arquivo. Verifique o formato e tamanho.';
  }

  // Transcrição
  if (message.includes('transcri')) {
    return 'Erro ao transcrever. Verifique se a API key da OpenAI está configurada.';
  }

  // Edge function errors genéricos
  if (message.includes('edge function') || message.includes('function returned')) {
    return 'Erro no servidor. Tente novamente em alguns instantes.';
  }

  // 500 / internal
  if (message.includes('500') || message.includes('internal')) {
    return 'Erro interno do servidor. Tente novamente em alguns instantes.';
  }

  return 'Ocorreu um erro inesperado. Tente novamente em alguns instantes.';
};
