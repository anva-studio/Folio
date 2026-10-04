import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

function values(element: HTMLElement | null) {
  return JSON.stringify(Array.from(element?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') ?? []).map(input => [input.id, input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value]));
}

/** Guard user dismissal; successful submissions still close through their parent. */
export function EntryDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const baseline = useRef('');
  const [confirm, setConfirm] = useState(false);
  const continuation = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (!open) { setConfirm(false); return; }
    baseline.current = values(body.current);
    const reset = () => { baseline.current = values(body.current); };
    const request = (event: Event) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (body.current?.closest('[role="dialog"]') !== dialogs.item(dialogs.length - 1)) return;
      continuation.current = (event as CustomEvent<() => void>).detail;
      if (values(body.current) !== baseline.current) setConfirm(true);
      else { onClose(); continuation.current?.(); continuation.current = null; }
    };
    body.current?.addEventListener('folio:formSaved', reset);
    window.addEventListener('folio:requestDismiss', request);
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(values(body.current)!==baseline.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    // A native keyboard can move the sticky action area over the focused field.
    // Reposition only that field after the viewport has applied its new height.
    let frame=0;
    const revealFocused=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const field=document.activeElement as HTMLElement | null;
        if(field&&body.current?.contains(field)&&field.matches('input,select,textarea')) field.scrollIntoView?.({block:'center',inline:'nearest',behavior:'instant'});
      });
    };
    window.addEventListener('resize',revealFocused);
    window.visualViewport?.addEventListener('resize',revealFocused);
    return () => {cancelAnimationFrame(frame);window.removeEventListener('resize',revealFocused);window.visualViewport?.removeEventListener('resize',revealFocused);body.current?.removeEventListener('folio:formSaved', reset); window.removeEventListener('folio:requestDismiss', request);window.removeEventListener('beforeunload',beforeUnload); };
  }, [open]);
  if (!open) return null;
  const dismiss = () => values(body.current) !== baseline.current ? setConfirm(true) : onClose();
  return <>
    <div className="modal-backdrop" data-entry-dialog role="dialog" aria-modal="true" aria-labelledby={id} onClick={dismiss}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2 className="modal-title" id={id}>{title}</h2><button type="button" className="icon-btn" aria-label="Close" onClick={dismiss}>×</button></div>
        <div className="modal-body" ref={body} onClickCapture={e => {
          const button = (e.target as HTMLElement).closest('button');
          if (button?.textContent?.trim() === 'Cancel' && !button.closest('.input-row')) { e.preventDefault(); e.stopPropagation(); dismiss(); }
        }}>{children}</div>
      </div>
    </div>
    {confirm && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={`${id}-discard`}>
      <div className="modal"><div className="modal-header"><h2 id={`${id}-discard`}>Discard unfinished entry?</h2><button className="icon-btn" aria-label="Close" onClick={() => {setConfirm(false);continuation.current=null;}}>×</button></div>
        <div className="modal-body"><p>Your changes in this form have not been recorded.</p></div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => {setConfirm(false);continuation.current=null;}}>Keep editing</button><button className="btn btn-danger" onClick={() => { setConfirm(false); onClose(); continuation.current?.(); continuation.current=null; }}>Discard entry</button></div>
      </div>
    </div>}
  </>;
}

