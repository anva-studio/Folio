const { app, BrowserWindow, protocol, session, shell, ipcMain, dialog, clipboard } = require('electron');
const path = require('node:path');
const { readFile } = require('node:fs/promises');

const {allowedExternal}=require('./external.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'folio', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch('disable-background-networking');
let win;
let canClose = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    const root = path.resolve(__dirname, '../dist');
    protocol.handle('folio', async request => {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
      const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!filename.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(filename)] || 'application/octet-stream';
      try { return new Response(await readFile(filename), { headers: { 'Content-Type': mime } }); }
      catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !details.url.startsWith('folio://app/') && !details.url.startsWith('blob:folio://app/') });
    });
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'"] } });
    });
    win = new BrowserWindow({ width: 1280, height: 850, minWidth: 360, minHeight: 540, title: 'Folio', icon: path.join(root,'icon-512.png'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    win.removeMenu();
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (allowedExternal(url)) void shell.openExternal(url).catch(()=>{});
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('folio://app/')) event.preventDefault(); });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    ipcMain.handle('folio:open-external',async(event,url)=>{
      if(event.sender!==win.webContents||event.senderFrame.url!=='folio://app/index.html'||!allowedExternal(url))throw new Error('Destination not supported');
      await shell.openExternal(url);
    });
    ipcMain.handle('folio:copy-app-info',async(event,kind)=>{
      if(event.sender!==win.webContents||event.senderFrame.url!=='folio://app/index.html'||!['email','app-info'].includes(kind))throw new Error('Copy action not supported');
      const contact=require('./contact.json');
      await clipboard.writeText(kind==='email'?contact.email:`Folio ${app.getVersion()}\nPlatform: Windows desktop\nWindows: ${require('node:os').release()}`);
    });
    win.on('close', event => {
      if (!canClose) { event.preventDefault(); win.webContents.send('folio:close-request'); }
    });
    ipcMain.on('folio:close-response', (event, saved) => {
      if (event.sender !== win.webContents || event.senderFrame.url !== 'folio://app/index.html') return;
      if (saved === true) { canClose = true; win.close(); }
      else void dialog.showMessageBox(win, { type: 'warning', title: 'Folio could not save', message: 'Your changes could not be saved. Folio stayed open so you can resolve the save error.' });
    });
    void win.loadURL('folio://app/index.html');
  });
  app.on('window-all-closed', () => app.quit());
}
