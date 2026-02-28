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

export async function checkFacebookToken(): Promise<TokenStatus & { dataAccessExpiresAt: Date | null; dataAccessDaysLeft: number | null }> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    return { isValid: false, expiresAt: null, daysUntilExpiry: null, appName: '', scopes: [], dataAccessExpiresAt: null, dataAccessDaysLeft: null };
  }

  try {
    const res = await axios.get('https://graph.facebook.com/debug_token', {
      params: { input_token: token, access_token: token },
      timeout: 10000,
    });

    const data = res.data?.data;
    if (!data?.is_valid) {
      return { isValid: false, expiresAt: null, daysUntilExpiry: null, appName: data?.application || '', scopes: [], dataAccessExpiresAt: null, dataAccessDaysLeft: null };
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at * 1000) : null;
    const daysUntilExpiry = expiresAt
      ? Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const dataAccessExpiresAt = data.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : null;
    const dataAccessDaysLeft = dataAccessExpiresAt
      ? Math.floor((dataAccessExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    // Auto-renew data access: if less than 30 days left, make an API call to refresh
    if (dataAccessDaysLeft !== null && dataAccessDaysLeft <= 30) {
      try {
        await axios.get('https://graph.facebook.com/v19.0/me', {
          params: { access_token: token, fields: 'id' },
          timeout: 10000,
        });
        console.log('[TokenMonitor] Data access renovado automaticamente (chamada API feita).');
      } catch {}
    }

    return {
      isValid: true,
      expiresAt,
      daysUntilExpiry,
      appName: data.application || '',
      scopes: data.scopes || [],
      dataAccessExpiresAt,
      dataAccessDaysLeft,
    };
  } catch (err: any) {
    console.error('[TokenMonitor] Erro ao verificar token:', err.message);
    return { isValid: false, expiresAt: null, daysUntilExpiry: null, appName: '', scopes: [], dataAccessExpiresAt: null, dataAccessDaysLeft: null };
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

  const tokenExpiry = status.daysUntilExpiry === null ? 'nunca' : `${status.daysUntilExpiry} dias`;
  const dataExpiry = status.dataAccessDaysLeft === null ? 'desconhecido' : `${status.dataAccessDaysLeft} dias`;
  console.log(`[TokenMonitor] Token válido. Expira: ${tokenExpiry}. Data access: ${dataExpiry}.`);

  if (status.daysUntilExpiry !== null && status.daysUntilExpiry <= 7) {
    for (const admin of admins) {
      await notificationsService.createAndEmit(
        admin.id,
        'TASK_ASSIGNED',
        `Token Facebook expira em ${status.daysUntilExpiry} dias!`,
        `Acesse Meta Business Manager → Usuários do Sistema → agency-system → Gerar novo token. Expira em: ${status.expiresAt?.toLocaleDateString('pt-BR')}`
      );
    }
  } else if (status.daysUntilExpiry !== null && status.daysUntilExpiry <= 15) {
    for (const admin of admins) {
      await notificationsService.createAndEmit(
        admin.id,
        'TASK_ASSIGNED',
        `Atenção: Token Facebook expira em ${status.daysUntilExpiry} dias`,
        `Renove o token em breve para não interromper as publicações automáticas.`
      );
    }
  }

  // Alerta de data access expirando
  if (status.dataAccessDaysLeft !== null && status.dataAccessDaysLeft <= 15) {
    for (const admin of admins) {
      await notificationsService.createAndEmit(
        admin.id,
        'TASK_ASSIGNED',
        `Data Access do Facebook expira em ${status.dataAccessDaysLeft} dias`,
        `O acesso aos dados do Facebook será revogado em breve. O sistema tentará renovar automaticamente.`
      );
    }
  }
}
