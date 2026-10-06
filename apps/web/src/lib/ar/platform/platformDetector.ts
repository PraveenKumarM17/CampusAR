export type ArPlatform = 'iOS' | 'Android' | 'Desktop' | 'Unknown';

export type ArDeviceInfo = {
  platform: ArPlatform;
  browser: 'Safari' | 'Chrome' | 'Firefox' | 'Unknown';
  userAgent: string;
  webXr: boolean;
  webGl: boolean;
  touch: boolean;
  maxTouchPoints: number;
};

export function detectArDevice(): ArDeviceInfo {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const platform = /iPad|iPhone|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Windows|Macintosh|Linux/.test(userAgent)
        ? 'Desktop'
        : 'Unknown';
  const browser = /Firefox/.test(userAgent)
    ? 'Firefox'
    : /Chrome|CriOS/.test(userAgent)
      ? 'Chrome'
      : /Safari/.test(userAgent)
        ? 'Safari'
        : 'Unknown';
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  return {
    platform,
    browser,
    userAgent,
    webXr: typeof navigator !== 'undefined' && 'xr' in navigator,
    webGl: Boolean(canvas?.getContext('webgl')),
    touch: typeof window !== 'undefined' && 'ontouchstart' in window,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
  };
}