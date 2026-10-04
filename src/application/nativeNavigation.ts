import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export async function listenForAndroidBack(handler: () => void) {
  if (Capacitor.getPlatform() !== 'android') return undefined;
  return App.addListener('backButton', handler);
}
