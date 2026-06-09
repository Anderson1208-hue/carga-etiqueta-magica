let registered = false;

/**
 * Mantido como no-op após rollback do Transistorsoft.
 * O APK voltou a usar o driver community antigo.
 */
export function registerGpsHeadlessTask() {
  if (registered) return;
  registered = true;
}
