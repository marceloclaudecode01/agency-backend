import { pauseAgent, resumeAgent, activateSafeMode, deactivateSafeMode, getSafeModeStatus } from '../../agents/safe-mode';
import { runSentinel } from '../../agents/system-sentinel.agent';
import { agentLog } from '../../agents/agent-logger';
import prisma from '../../config/database';

export interface CommandResult {
  command: string;
  success: boolean;
  message: string;
  data?: any;
}

// Fuzzy map: user input → real agent names (PT + EN)
const AGENT_ALIASES: Record<string, string> = {
  'scheduler': 'post-scheduler',
  'agendador': 'post-scheduler',
  'publicador': 'post-scheduler',
  'motor': 'content-engine',
  'engine': 'content-engine',
  'metricas': 'metrics-collector',
  'metrics': 'metrics-collector',
  'token': 'token-monitor',
  'tiktok': 'tiktok-products',
  'video': 'motivational-video',
  'tendencias': 'trending-topics',
  'trending': 'trending-topics',
  'comentarios': 'comment-responder',
  'comments': 'comment-responder',
  'prazos': 'deadline-notifier',
  'deadline': 'deadline-notifier',
  'governor': 'content-governor',
  'growth': 'growth-director',
  'ab test': 'ab-testing',
  'teste ab': 'ab-testing',
  'viral': 'viral-mechanics',
  'reputacao': 'reputation-monitor',
  'reputation': 'reputation-monitor',
  'lead': 'lead-capture',
  'leads': 'lead-capture',
  'monetization': 'monetization-engine',
  'monetizacao': 'monetization-engine',
  'strategic': 'strategic-command',
  'estrategia': 'strategic-command',
  'market': 'market-intelligence',
  'mercado': 'market-intelligence',
  'niche': 'niche-learning',
  'nicho': 'niche-learning',
  'traffic': 'paid-traffic',
  'trafego': 'paid-traffic',
  'ads': 'paid-traffic',
  'creative': 'ad-creative',
  'criativo': 'ad-creative',
  'compliance': 'policy-compliance',
  'variation': 'pattern-variation',
  'variacao': 'pattern-variation',
  'sentinel': 'system-sentinel',
  'sentinela': 'system-sentinel',
  'performance': 'performance-learner',
  'brand': 'brand-brain',
  'marca': 'brand-brain',
  'strategist': 'content-strategist',
  'orchestrator': 'orchestrator',
  'facebook': 'facebook-publisher',
  'instagram': 'instagram-sync',
  'campaign': 'campaign-manager',
  'campanha': 'campaign-manager',
  'roi': 'roi-intel',
  'safe mode': 'safe-mode',
  'modo seguro': 'safe-mode',
};

function resolveAgent(input: string): string {
  const lower = input.toLowerCase().trim();
  return AGENT_ALIASES[lower] || lower;
}

interface CommandDef {
  name: string;
  patterns: RegExp[];
  execute: (match: RegExpMatchArray) => Promise<CommandResult>;
}

const COMMANDS: CommandDef[] = [
  {
    name: 'pause_agent',
    patterns: [
      /(?:pausar?|pause|parar?|stop)\s+(?:o\s+)?(?:agente?\s+)?(.+)/i,
    ],
    execute: async (match) => {
      const agentFunction = resolveAgent(match[1]);
      try {
        const agent = await prisma.agent.findFirst({
          where: { OR: [{ name: { contains: match[1].trim(), mode: 'insensitive' as any } }, { function: agentFunction }] },
        });
        if (agent) {
          await prisma.agent.update({ where: { id: agent.id }, data: { status: 'paused' } });
        } else {
          await pauseAgent(agentFunction); // legacy fallback
        }
        await agentLog('Orion', `Comando: pausar agente "${agent?.name || agentFunction}"`, { type: 'action' });
        return { command: 'pause_agent', success: true, message: `Agente "${agent?.name || agentFunction}" pausado com sucesso.` };
      } catch (e: any) {
        return { command: 'pause_agent', success: false, message: `Falha ao pausar "${agentFunction}": ${e.message}` };
      }
    },
  },
  {
    name: 'resume_agent',
    patterns: [
      /(?:retomar|resume|reativar?|reactivate|despausar?|unpause)\s+(?:o\s+)?(?:agente?\s+)?(.+)/i,
    ],
    execute: async (match) => {
      const agentFunction = resolveAgent(match[1]);
      try {
        const agent = await prisma.agent.findFirst({
          where: { OR: [{ name: { contains: match[1].trim(), mode: 'insensitive' as any } }, { function: agentFunction }] },
        });
        if (agent) {
          await prisma.agent.update({ where: { id: agent.id }, data: { status: 'active' } });
        } else {
          await resumeAgent(agentFunction); // legacy fallback
        }
        await agentLog('Orion', `Comando: retomar agente "${agent?.name || agentFunction}"`, { type: 'action' });
        return { command: 'resume_agent', success: true, message: `Agente "${agent?.name || agentFunction}" retomado com sucesso.` };
      } catch (e: any) {
        return { command: 'resume_agent', success: false, message: `Falha ao retomar "${agentFunction}": ${e.message}` };
      }
    },
  },
  {
    name: 'safe_mode_on',
    patterns: [
      /(?:ativar?|activate|ligar?|enable)\s+(?:o\s+)?(?:safe\s*mode|modo\s*seguro)/i,
    ],
    execute: async () => {
      try {
        await activateSafeMode('Ativado via Orion chat', 'Orion');
        await agentLog('Orion', 'Comando: ativar safe mode', { type: 'action' });
        return { command: 'safe_mode_on', success: true, message: 'Safe Mode ATIVADO. Todos os agentes autônomos estão pausados.' };
      } catch (e: any) {
        return { command: 'safe_mode_on', success: false, message: `Falha ao ativar safe mode: ${e.message}` };
      }
    },
  },
  {
    name: 'safe_mode_off',
    patterns: [
      /(?:desativar?|deactivate|desligar?|disable)\s+(?:o\s+)?(?:safe\s*mode|modo\s*seguro)/i,
    ],
    execute: async () => {
      try {
        await deactivateSafeMode();
        await agentLog('Orion', 'Comando: desativar safe mode', { type: 'action' });
        return { command: 'safe_mode_off', success: true, message: 'Safe Mode DESATIVADO. Agentes voltaram ao normal.' };
      } catch (e: any) {
        return { command: 'safe_mode_off', success: false, message: `Falha ao desativar safe mode: ${e.message}` };
      }
    },
  },
  {
    name: 'run_sentinel',
    patterns: [
      /(?:rodar?|run|executar?|execute)\s+(?:o\s+)?sentinel/i,
      /sentinel\s+(?:scan|check|verificar?|checar?)/i,
    ],
    execute: async () => {
      try {
        const report = await runSentinel();
        await agentLog('Orion', 'Comando: executar sentinel scan', { type: 'action' });
        return { command: 'run_sentinel', success: true, message: 'Sentinel scan concluído.', data: report };
      } catch (e: any) {
        return { command: 'run_sentinel', success: false, message: `Falha ao executar sentinel: ${e.message}` };
      }
    },
  },
  {
    name: 'override_post',
    patterns: [
      /(?:aprovar?|approve)\s+(?:o\s+)?post\s+#?(\d+)/i,
      /(?:rejeitar?|reject)\s+(?:o\s+)?post\s+#?(\d+)/i,
    ],
    execute: async (match) => {
      const postId = match[1];
      const isApprove = /aprovar?|approve/i.test(match[0]);
      const newDecision = isApprove ? 'APPROVED' : 'REJECTED';
      try {
        await prisma.scheduledPost.update({
          where: { id: postId },
          data: { governorDecision: newDecision, governorReason: `Override manual via Orion`, governorReviewedAt: new Date() },
        });
        await agentLog('Orion', `Comando: override post #${postId} → ${newDecision}`, { type: 'action' });
        return { command: 'override_post', success: true, message: `Post #${postId} marcado como ${newDecision}.` };
      } catch (e: any) {
        return { command: 'override_post', success: false, message: `Falha ao alterar post #${postId}: ${e.message}` };
      }
    },
  },
  {
    name: 'get_status',
    patterns: [
      /(?:status|estado)\s+(?:do\s+)?(?:sistema|system)/i,
      /system\s+status/i,
    ],
    execute: async () => {
      try {
        const safeStatus = await getSafeModeStatus();
        const pausedFromDB = await prisma.agent.findMany({ where: { status: 'paused' } }).catch(() => []);
        const paused = pausedFromDB.map((a: any) => a.name);
        await agentLog('Orion', 'Comando: consultar status do sistema', { type: 'action' });
        return {
          command: 'get_status',
          success: true,
          message: `Safe Mode: ${safeStatus.enabled ? 'ATIVO' : 'desativado'}${safeStatus.reason ? ` (${safeStatus.reason})` : ''}. Agentes pausados: ${paused.length > 0 ? paused.join(', ') : 'nenhum'}.`,
          data: { safeMode: safeStatus, pausedAgents: paused },
        };
      } catch (e: any) {
        return { command: 'get_status', success: false, message: `Falha ao consultar status: ${e.message}` };
      }
    },
  },
];

export function matchCommand(userMessage: string): { def: CommandDef; match: RegExpMatchArray } | null {
  for (const def of COMMANDS) {
    for (const pattern of def.patterns) {
      const match = userMessage.match(pattern);
      if (match) return { def, match };
    }
  }
  return null;
}

export async function executeCommand(userMessage: string): Promise<CommandResult | null> {
  const found = matchCommand(userMessage);
  if (!found) return null;
  return found.def.execute(found.match);
}

export const COMMAND_LIST = `
COMANDOS DISPONÍVEIS (o usuário pode pedir em linguagem natural):
- Pausar/retomar agentes: "pausar o scheduler", "retomar o governor"
- Safe Mode: "ativar safe mode", "desativar modo seguro"
- Sentinel: "rodar sentinel", "sentinel check"
- Override post: "aprovar post #123", "rejeitar post #456"
- Status sistema: "status do sistema", "system status"
Quando um comando é executado, você receberá o resultado para narrar ao usuário.`;
