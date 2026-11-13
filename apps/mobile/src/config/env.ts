/** Default API for Android emulator → host machine. Override in release builds. */
const DEV_ANDROID_API = 'http://10.0.2.2:4000/api';

export function resolveMobileApiBaseUrl(): string {
  const fromEnv = process.env.API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }
  return DEV_ANDROID_API;
}
