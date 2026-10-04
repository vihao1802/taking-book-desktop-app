// Builds the debug APK with Gradle after `cap sync`, and prints where it landed.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

const result = spawnSync(gradlew, ['assembleDebug'], { cwd: androidDir, stdio: 'inherit' });
if (result.status !== 0) {
  console.error('Gradle failed. Check that JAVA_HOME points at a JDK 21 and ANDROID_HOME at an Android SDK with platform 36.');
  process.exit(result.status ?? 1);
}

const apk = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
console.log(existsSync(apk) ? `Debug APK: ${apk}` : 'Gradle succeeded but the debug APK was not found.');
