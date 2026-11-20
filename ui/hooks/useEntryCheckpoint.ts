import { useLayoutEffect, useRef, useState } from 'react';
/** Reset the owning dialog's edit checkpoint after a successful save and React render. */
export function useEntryCheckpoint<T extends HTMLElement>() {
    const ref = useRef<T>(null), [revision, setRevision] = useState(0);
    useLayoutEffect(() => { if (revision)
        ref.current?.dispatchEvent(new Event('folio:formSaved', { bubbles: true })); }, [revision]);
    return { ref, markSaved: () => setRevision(v => v + 1) };
}
