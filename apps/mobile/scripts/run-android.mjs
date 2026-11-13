/**
 * Run Android with Microsoft OpenJDK 17 on Windows (ignores stale JAVA_HOME).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAndroidDeviceReady } from './check-android-device.mjs';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function microsoftJdk17() {
  const fixed = 'C:\\Program Files\\Microsoft\\jdk-17.0.16.8-hotspot';
  if (existsSync(path.join(fixed, 'bin', 'java.exe'))) {
    return fixed;
  }
  const msRoot = 'C:\\Program Files\\Microsoft';
  if (!existsSync(msRoot)) {
    return null;
  }
  const dirs = readdirSync(msRoot)
    .filter((name) => name.startsWith('jdk-17'))
    .sort()
    .reverse();
  for (const name of dirs) {
    const home = path.join(msRoot, name);
    if (existsSync(path.join(home, 'bin', 'java.exe'))) {
      return home;
    }
  }
  return null;
}

const jdk = microsoftJdk17();
if (!jdk) {
  console.error(
    'Microsoft OpenJDK 17 not found. Install from https://learn.microsoft.com/en-us/java/openjdk/download',
  );
  process.exit(1);
}

const env = { ...process.env, JAVA_HOME: jdk };
console.log(`Using JAVA_HOME=${jdk}`);

const deviceCheck = checkAndroidDeviceReady();
if (!deviceCheck.ok) {
  console.error('\n--- Android device not ready ---\n');
  console.error(deviceCheck.message);
  console.error('\n--------------------------------\n');
  process.exit(1);
}
console.log(deviceCheck.message);

const args = ['react-native', 'run-android', ...process.argv.slice(2)];
const result = spawnSync('npx', args, {
  cwd: mobileRoot,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
