// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadTextFile, safeFilename } from '../../src/application/fileDownload';
const mocks = vi.hoisted(() => ({ native: vi.fn(() => false), write: vi.fn(), share: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: mocks.write }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); mocks.native.mockReturnValue(false); });
describe('Platform-safe exports', () => {
  it('keeps browser object URLs alive until the download has started', async () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:export', revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadTextFile('../unsafe/name.csv', 'test', 'text/csv');
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector('a')).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(revoke).toHaveBeenCalledWith('blob:export');
    vi.unstubAllGlobals();
  });
  it('writes native exports to cache and awaits the platform share flow', async () => {
    mocks.native.mockReturnValue(true);
    mocks.write.mockResolvedValue({ uri: 'file:///cache/export.csv' });
    mocks.share.mockResolvedValue({});
    await downloadTextFile('account.csv', 'private,data', 'text/csv');
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE', encoding: 'utf8', data: 'private,data' }));
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/export.csv'] }));
  });
  it('propagates native file errors without reporting a successful export', async () => {
    mocks.native.mockReturnValue(true);
    mocks.write.mockRejectedValue(new Error('Storage full'));
    await expect(downloadTextFile('backup.folio', '{}', 'application/octet-stream')).rejects.toThrow('Storage full');
  });
  it('strips path separators and control characters from filenames', () => {
    expect(safeFilename('../cash\u0000/backup.csv')).toBe('-cash--backup.csv');
  });
});
