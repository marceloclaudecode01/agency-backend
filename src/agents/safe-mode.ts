import prisma from '../config/database';

export async function isSafeModeActive(): Promise<boolean> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'safeMode' } });
    return config?.value === true || (config?.value as any)?.enabled === true;
  } catch {
    return false;
  }
}

export async function activateSafeMode(reason: string, activatedBy: string = 'System Sentinel'): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: 'safeMode' },
    create: { key: 'safeMode', value: { enabled: true, reason, activatedBy, activatedAt: new Date().toISOString() } as any },
    update: { value: { enabled: true, reason, activatedBy, activatedAt: new Date().toISOString() } as any },
  });
}

export async function deactivateSafeMode(): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: 'safeMode' },
    create: { key: 'safeMode', value: { enabled: false } as any },
    update: { value: { enabled: false } as any },
  });
}

export async function getSafeModeStatus(): Promise<{ enabled: boolean; reason?: string; activatedBy?: string; activatedAt?: string }> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'safeMode' } });
    if (!config) return { enabled: false };
    const val = config.value as any;
    return { enabled: val?.enabled || false, reason: val?.reason, activatedBy: val?.activatedBy, activatedAt: val?.activatedAt };
  } catch {
    return { enabled: false };
  }
}

export async function isAgentPaused(agentName: string): Promise<boolean> {
  try {
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [{ name: agentName }, { function: agentName }],
      },
    });
    if (agent) return agent.status === 'paused';
    // Fallback to legacy SystemConfig for agents not yet in DB
    const config = await prisma.systemConfig.findUnique({ where: { key: 'pausedAgents' } });
    if (!config) return false;
    const paused = config.value as any;
    return Array.isArray(paused) ? paused.includes(agentName) : false;
  } catch {
    return false;
  }
}

export async function pauseAgent(agentName: string): Promise<void> {
  // Try Agent table first
  const agent = await prisma.agent.findFirst({
    where: { OR: [{ name: agentName }, { function: agentName }] },
  }).catch(() => null);

  if (agent) {
    await prisma.agent.update({ where: { id: agent.id }, data: { status: 'paused' } });
    return;
  }

  // Fallback to legacy SystemConfig
  const config = await prisma.systemConfig.findUnique({ where: { key: 'pausedAgents' } });
  const current: string[] = Array.isArray(config?.value) ? (config.value as string[]) : [];
  if (!current.includes(agentName)) current.push(agentName);
  await prisma.systemConfig.upsert({
    where: { key: 'pausedAgents' },
    create: { key: 'pausedAgents', value: current as any },
    update: { value: current as any },
  });
}

export async function resumeAgent(agentName: string): Promise<void> {
  // Try Agent table first
  const agent = await prisma.agent.findFirst({
    where: { OR: [{ name: agentName }, { function: agentName }] },
  }).catch(() => null);

  if (agent) {
    await prisma.agent.update({ where: { id: agent.id }, data: { status: 'active' } });
    return;
  }

  // Fallback to legacy SystemConfig
  const config = await prisma.systemConfig.findUnique({ where: { key: 'pausedAgents' } });
  const current: string[] = Array.isArray(config?.value) ? (config.value as string[]) : [];
  const updated = current.filter((a) => a !== agentName);
  await prisma.systemConfig.upsert({
    where: { key: 'pausedAgents' },
    create: { key: 'pausedAgents', value: updated as any },
    update: { value: updated as any },
  });
}
