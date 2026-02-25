import axios from 'axios';
import prisma from '../config/database';
import { notificationsService } from '../modules/notifications/notifications.service';

export interface TokenStatus {
  isValid: boolean;
  expiresAt: Date | null;
  daysUntilExpiry: number | null;
  appName: string;
  scopes: string[];
}

export async function checkFacebookToken(): Promise<TokenStatus> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    return { isValid: false, expiresAt: null, daysUntilExpiry: null, appName: '', scopes: [] };
  }

  try {
    const res = await axios.get('https://graph.facebook.com/debug_token', {
      params: { input_token: token, access_token: token },
      timeout: 10000,
    });

    const data = res.data?.data;
    if (!data?.is_valid) {
      return { isValid: false, expiresAt: null, daysUntilExpiry: null, appName: data?.application || '', scopes: [] };
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at * 1000) : null;
    const daysUntilExpiry = expiresAt
      ? Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      isValid: true,
      expiresAt,
      daysUntilExpiry,
      appName: data.application || '',
      scopes: data.scopes || [],
    };
  } catch (err: any) {
    console.error('[TokenMonitor] Erro ao verificar token:', err.message);
    return { isValid: false, expiresAt: null, daysUntilExpiry: null, appName: '', scopes: [] };
  }
}

export async function runTokenMonitor(): Promise<void> {
  const status = await checkFacebookToken();
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });

  if (!status.isValid) {
    console.warn('[TokenMonitor] Token inválido ou expirado!');
    for (const admin of admins) {
      await notificationsService.createAndEmit(
        admin.id,
        'TASK_ASSIGNED',
        'Token Facebook EXPIRADO',
        'O token do Facebook expirou! Acesse Meta Business Manager e gere um novo token.'
      );
    }
    return;
  }

  if (status.daysUntilExpiry !== null) {
    console.log(`[TokenMonitor] Token válido. Expira em ${status.daysUntilExpiry} dias.`);

    if (status.daysUntilExpiry <= 7) {
      for (const admin of admins) {
        await notificationsService.createAndEmit(
          admin.id,
          'TASK_ASSIGNED',
          `Token Facebook expira em ${status.daysUntilExpiry} dias!`,
          `Acesse Meta Business Manager → Usuários do Sistema → agency-system → Gerar novo token. Expira em: ${status.expiresAt?.toLocaleDateString('pt-BR')}`
        );
      }
    } else if (status.daysUntilExpiry <= 15) {
      for (const admin of admins) {
        await notificationsService.createAndEmit(
          admin.id,
          'TASK_ASSIGNED',
          `Atenção: Token Facebook expira em ${status.daysUntilExpiry} dias`,
          `Renove o token em breve para não interromper as publicações automáticas.`
        );
      }
    }
  }
}
