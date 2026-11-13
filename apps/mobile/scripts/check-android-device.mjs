/**
 * Verify an authorized Android device or emulator is available before install.
 */
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: true });
}

function listAdbDevices() {
  const adb = run('adb', ['devices']);
  if (adb.status !== 0) {
    return { error: 'adb failed. Add Android SDK platform-tools to PATH.', lines: [] };
  }
  const lines = adb.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);
  return { error: null, lines };
}

function listAvds() {
  const em = run('emulator', ['-list-avds']);
  if (em.status !== 0) {
    return [];
  }
  return em.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

export function checkAndroidDeviceReady() {
  const { error, lines } = listAdbDevices();
  if (error) {
    return { ok: false, message: error };
  }

  const parsed = lines.map((line) => {
    const [id, state, ...rest] = line.split(/\s+/);
    return { id, state, rest: rest.join(' ') };
  });

  const unauthorized = parsed.filter((d) => d.state === 'unauthorized');
  if (unauthorized.length > 0) {
    const ids = unauthorized.map((d) => d.id).join(', ');
    return {
      ok: false,
      message: [
        `USB device(s) not authorized for debugging: ${ids}`,
        '',
        'On your phone:',
        '  1. Unlock the screen.',
        '  2. Set USB mode to "File transfer" / MTP (not "Charge only").',
        '  3. When prompted, tap "Allow USB debugging" (check "Always allow" if offered).',
        '  4. If no prompt: Settings → Developer options → Revoke USB debugging authorizations,',
        '     unplug USB, plug back in, accept the prompt again.',
        '',
        'On PC (then retry npm run android:mobile):',
        '  adb kill-server',
        '  adb start-server',
        '  adb devices',
        '  (must show your device as "device", not "unauthorized")',
      ].join('\n'),
    };
  }

  const online = parsed.filter((d) => d.state === 'device');
  if (online.length > 0) {
    return { ok: true, message: `Ready: ${online.map((d) => d.id).join(', ')}` };
  }

  const offline = parsed.filter((d) => d.state === 'offline');
  const avds = listAvds();
  const parts = [
    'No online Android device for install.',
    offline.length > 0 ? `Offline: ${offline.map((d) => d.id).join(', ')}` : null,
    avds.length === 0
      ? 'No AVDs: Android Studio → Device Manager → Create Virtual Device, then start it.'
      : `AVDs (start one in Device Manager): ${avds.join(', ')}`,
    'Or connect a phone with USB debugging enabled and authorized.',
  ].filter(Boolean);

  return { ok: false, message: parts.join('\n') };
}

if (process.argv[1]?.endsWith('check-android-device.mjs')) {
  const result = checkAndroidDeviceReady();
  if (result.ok) {
    console.log(result.message);
    process.exit(0);
  }
  console.error(result.message);
  process.exit(1);
}
