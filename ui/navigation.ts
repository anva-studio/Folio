export function navigate(screen: string, action?: string, id?: string) {
  window.dispatchEvent(new CustomEvent('folio:navigate', { detail: { screen, action, id } }));
}
