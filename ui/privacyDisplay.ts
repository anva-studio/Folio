import { useSyncExternalStore } from 'react';
const KEY='folio:hide-amounts';
function read(){try{return typeof localStorage!=='undefined'&&localStorage.getItem(KEY)==='yes';}catch{return false;}}
let hidden=read();
const listeners=new Set<()=>void>();
const emit=()=>{for(const listener of listeners)listener();};
function storage(event:StorageEvent){if(event.key===KEY||event.key===null){hidden=event.key===null?false:event.newValue==='yes';emit();}}
function subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1)window.addEventListener('storage',storage);return ()=>{listeners.delete(listener);if(listeners.size===0)window.removeEventListener('storage',storage);};}
export function setAmountsHidden(value:boolean){hidden=value;try{localStorage.setItem(KEY,value?'yes':'no');}catch{/* The presentation toggle still works for this running app. */}emit();}
export function useAmountsHidden(){return useSyncExternalStore(subscribe,()=>hidden,()=>false);}
