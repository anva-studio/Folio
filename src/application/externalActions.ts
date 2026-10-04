import { Capacitor } from '@capacitor/core';
import configuration from '../../desktop/contact.json';
export const CONTACT=configuration;
export const EMAIL_URL='mailto:'+CONTACT.email;
export function allowedExternal(url:string){return [CONTACT.website,CONTACT.feedback,CONTACT.coffee,EMAIL_URL].includes(url);}
export async function openExternal(url:string){
 if(!allowedExternal(url))throw new Error('This external destination is not supported.');
 if(window.folioDesktop?.openExternal){await window.folioDesktop.openExternal(url);return;}
 if(Capacitor.getPlatform()==='android'){
  const {registerPlugin}=await import('@capacitor/core');const plugin=registerPlugin<{open(options:{url:string}):Promise<void>}>('FolioExternal');await plugin.open({url});return;
 }
 if(url===EMAIL_URL){window.location.href=url;return;}
 const opened=window.open(url,'_blank','noopener,noreferrer');void opened;
}
export async function copyPublicInfo(kind:'email'|'app-info',text:string){
 if(window.folioDesktop?.copyAppInfo){await window.folioDesktop.copyAppInfo(kind);return;}
 if(Capacitor.getPlatform()==='android'){
  const {registerPlugin}=await import('@capacitor/core');const plugin=registerPlugin<{copy(options:{kind:string}):Promise<void>}>('FolioExternal');await plugin.copy({kind});return;
 }
 await navigator.clipboard.writeText(text);
}
