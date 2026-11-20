import { useEffect } from 'react';
/** Modified Enter only inside the focused form; ordinary typing and OS keys stay untouched. */
export function useFormSubmitShortcut(){
  useEffect(()=>{
    const submit=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.isComposing||event.repeat||event.key!=='Enter'||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey))return;
      const form=document.activeElement?.closest('form');
      if(!(form instanceof HTMLFormElement))return;
      const button=[...form.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button.btn-primary[type=submit],input.btn-primary[type=submit]')].find(b=>!b.disabled&&b.closest('form')===form&&!b.classList.contains('btn-danger'));
      if(!button)return;
      event.preventDefault();form.requestSubmit(button);
    };
    window.addEventListener('keydown',submit);
    return ()=>window.removeEventListener('keydown',submit);
  },[]);
}
