import {useEffect} from 'react';
import {navigate} from '../navigation';

/** Modified workspace commands; typing, assistive input and open dialogs keep their keys. */
export function useWorkspaceShortcuts(){
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      if(typeof event.key!=='string'||event.defaultPrevented||event.repeat||event.isComposing||event.getModifierState?.('AltGraph')||event.shiftKey||!(event.ctrlKey||event.metaKey))return;
      const target=document.activeElement;
      if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')))return;
      if(document.querySelector('[role="dialog"],[aria-modal="true"]'))return;
      const key=event.key.toLowerCase();
      if(key==='k'&&!event.altKey){event.preventDefault();navigate('transactions','search');}
      else if(key==='n'&&event.altKey){event.preventDefault();navigate('transactions','create');}
    };
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
  },[]);
}
