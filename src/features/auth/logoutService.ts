import { authService } from './authService';
import { syncEngine } from '../sync/syncEngine';

export async function signOutWithPendingWarning(ownerId: string): Promise<boolean> {
  const pendingCount = await syncEngine.getPendingCount(ownerId);
  if (
    pendingCount > 0 &&
    !window.confirm(
      `Tienes ${pendingCount} operaciones pendientes de sincronizar en este dispositivo. Si cierras sesión, seguirán vinculadas a esta cuenta y no estarán disponibles para otras cuentas. ¿Cerrar sesión?`,
    )
  ) {
    return false;
  }

  await authService.signOut();
  return true;
}
