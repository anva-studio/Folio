const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('folioDesktop', {
  openExternal(url) { return ipcRenderer.invoke('folio:open-external', url); },
  copyAppInfo(kind) { return ipcRenderer.invoke('folio:copy-app-info', kind); },
  onCloseRequest(callback) {
    const listener = () => callback();
    ipcRenderer.on('folio:close-request', listener);
    return () => ipcRenderer.removeListener('folio:close-request', listener);
  },
  respondToClose(saved) { ipcRenderer.send('folio:close-response', saved === true); },
});
