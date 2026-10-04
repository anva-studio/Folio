interface Window {
  folioDesktop?: {
    openExternal?(url: string): Promise<void>;
    copyAppInfo?(kind: 'email' | 'app-info'): Promise<void>;
    onCloseRequest(callback: () => void): () => void;
    respondToClose(saved: boolean): void;
  };
}
