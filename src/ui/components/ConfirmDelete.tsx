import { useId } from 'react';
export function ConfirmDelete({ name, kind, onCancel, onConfirm }: { name: string; kind: string; onCancel: () => void; onConfirm: () => void }) {
  const title = useId();
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={title} onClick={onCancel}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2 className="modal-title" id={title}>Delete {kind}</h2><button className="icon-btn" aria-label="Close" onClick={onCancel}>✕</button></div>
      <div className="modal-body">
        <p>Permanently delete <strong>{name}</strong>? This cannot be undone. You can deactivate it instead to keep the record.</p>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-danger" onClick={onConfirm}>Delete</button></div>
      </div>
    </div>
  </div>;
}
