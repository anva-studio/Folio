import { clearNativeExportCache } from './application/fileDownload';
void clearNativeExportCache();
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./completion.css";
import { getAppearance, applyTheme } from "./application/devicePreferences";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root is missing in index.html");

const appearance = getAppearance();
applyTheme(appearance);
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getAppearance() === 'system') {
      applyTheme('system');
    }
  });
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

