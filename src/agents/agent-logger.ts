import prisma from '../config/database';

// Emite logs via Socket.io (importado lazy para evitar dependência circular)
let _io: any = null;
export function setAgentLoggerIo(io: any) {
  _io = io;
}

export async function agentLog(
  from: string,
  message: string,
  options: {
    to?: string;
    type?: 'info' | 'action' | 'result' | 'error' | 'communication';
    payload?: any;
  } = {}
) {
  const { to, type = 'info', payload } = options;

  try {
    const log = await prisma.agentLog.create({
      data: { from, to: to || null, type, message, payload: payload || undefined },
    });

    // Emite em tempo real para todos os clientes conectados
    if (_io) {
      _io.emit('agent:log', log);
    }

    return log;
  } catch (err) {
    // Silencia erros de log para não quebrar o fluxo do agente
    console.error('[AgentLogger] Erro ao salvar log:', err);
  }
}
