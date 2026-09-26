const appErrorMessages = {
  'supabase-configuration': 'No se pudo configurar la conexión con el servicio.',
  'session-unavailable': 'No se pudo verificar tu sesión. Inténtalo de nuevo.',
} as const;

export type AppErrorCode = keyof typeof appErrorMessages;

export function getAppErrorMessage(code: AppErrorCode): string {
  return appErrorMessages[code];
}
