import { createContext, useContext } from 'react';
export type ProductActions={example:boolean;openExample:(screen?:string)=>void;openWelcome:()=>void;openProfiles:()=>void;openHelp:(article?:string)=>void;openAbout:()=>void;resetExample:()=>Promise<void>;deleteExample:()=>Promise<void>};
export const ProductContext=createContext<ProductActions>({example:false,openExample:()=>{},openWelcome:()=>{},openProfiles:()=>{},openHelp:()=>{},openAbout:()=>{},resetExample:async()=>{},deleteExample:async()=>{}});
export const useProduct=()=>useContext(ProductContext);
export function guardedTransition(action:()=>void){
 const dialogs=document.querySelectorAll<HTMLElement>('[role=dialog]');const last=dialogs.item(dialogs.length-1);
 if(last?.hasAttribute('data-entry-dialog'))window.dispatchEvent(new CustomEvent('folio:requestDismiss',{detail:action}));
 else if(last?.getAttribute('aria-labelledby')?.endsWith('-discard'))return;
 else action();
}
