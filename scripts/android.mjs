import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const tasks = { debug: 'assembleDebug', release: 'assembleRelease', test: ':app:connectedDebugAndroidTest' };
const task = tasks[process.argv[2] || 'debug'];
if (!task) throw new Error('Choose debug, release, or test');
const env = { ...process.env };
// Select JDK 21 for this build only; do not change the user's machine settings.
const installed21 = process.platform === 'win32' ? path.join(env.ProgramFiles || 'C:/Program Files', 'Java/jdk-21') : undefined;
if (!env.JAVA_HOME && installed21 && fs.existsSync(path.join(installed21, 'bin/java.exe'))) env.JAVA_HOME = installed21;
const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const check = spawnSync(java, ['-version'], { encoding: 'utf8', env });
if (check.status !== 0 || !/version "21[.\"]/.test(check.stderr + check.stdout)) throw new Error('Android builds require JDK 21. Set JAVA_HOME to its installation directory.');
if (!env.ANDROID_HOME && process.platform === 'win32') {
 const sdk = path.join(env.LOCALAPPDATA || '', 'Android/Sdk');
 if (fs.existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT && !fs.existsSync('android/local.properties')) throw new Error('Set ANDROID_HOME to an installed Android SDK, or add android/local.properties.');
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [task], { cwd: 'android', env, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);

