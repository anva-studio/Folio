export const BACKUP_FILE_LIMIT = 50 * 1024 * 1024;
export const LARGE_BACKUP_FILE_LIMIT = 256 * 1024 * 1024;
export class BackupFileError extends Error {}

/** Scan JSON nesting before parsing, ignoring brackets inside quoted strings. */
export function assertJsonDepth(text: string, maximum = 64): void {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      depth++;
      if (depth > maximum) throw new BackupFileError('This file has too many nested levels');
    } else if (character === '}' || character === ']') depth--;
  }
}

export async function readBackupFile(file: File, allowLarge = false): Promise<unknown> {
  const desktop = !!window.folioDesktop;
  const limit = allowLarge && desktop ? LARGE_BACKUP_FILE_LIMIT : BACKUP_FILE_LIMIT;
  if (file.size > limit) {
    throw new BackupFileError(desktop
      ? 'This backup exceeds the selected size limit. Standard files support 50 MB; explicit large-file recovery supports up to 256 MB. Keep the original file.'
      : 'This backup is too large for phone/browser recovery (50 MB). Keep the file and use large-file recovery in Folio for Windows.');
  }
  const text = typeof file.text === 'function' ? await file.text() : await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new BackupFileError('Could not read the selected backup'));
    reader.onerror = () => reject(new BackupFileError('Could not read the selected backup'));
    reader.readAsText(file);
  });
  assertJsonDepth(text);
  return JSON.parse(text);
}
