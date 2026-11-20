import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function safeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/^\.+/, '').slice(0, 180) || 'folio-export';
}

export async function downloadTextFile(filename: string, content: string, mimeType: string): Promise<void> {
  const name = safeFilename(filename);
  if (Capacitor.isNativePlatform()) {
    const path = `folio-exports/${crypto.randomUUID()}/${name}`;
    const { uri } = await Filesystem.writeFile({ path, data: content, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
    await Share.share({ title: name, files: [uri], dialogTitle: 'Save or share Folio export' });
    // Retain until a later app start so the receiving app can finish reading it.
    return;
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  try { a.click(); } finally {
    a.remove();
    // Give the browser/download manager time to consume the object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export async function clearNativeExportCache(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await Filesystem.rmdir({ path: 'folio-exports', directory: Directory.Cache, recursive: true }); } catch { /* No previous exports. */ }
}

