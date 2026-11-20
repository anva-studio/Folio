import {Capacitor,registerPlugin} from '@capacitor/core';
type NativeAppearance={apply:(options:{theme:'light'|'dark'})=>Promise<void>};
let nativeAppearance:NativeAppearance|undefined;
export function syncNativeAppearance(theme:'light'|'dark'){
 if(Capacitor.getPlatform()!=='android')return;
 const plugin=nativeAppearance??registerPlugin<NativeAppearance>('FolioAppearance');nativeAppearance=plugin;
 void plugin.apply({theme}).catch(()=>{/* Cosmetic OS chrome does not block access to the vault. */});
}
