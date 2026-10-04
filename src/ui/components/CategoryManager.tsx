import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { CannotDeleteCategoryError } from '../../application/folioController.js';
import type { Category } from '../../domain/types.js';

type Props = {
  controller?: any;
  onClose?: () => void;
};

export default function CategoryManager({ controller: propController, onClose }: Props) {
  // onClose is accepted for API compatibility; Modal manages closing
  void onClose;
  const { controller: sessionController } = useSession();
  const controller = propController ?? sessionController;
  const [tick, setTick] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [creatingKind, setCreatingKind] = useState<'income' | 'expense' | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');

  useEffect(() => {
    if (!controller) return;
    const un = controller.subscribe(() => setTick(t => t + 1));
    return un;
  }, [controller]);

  if (!controller) return null;

  const categories: Category[] = controller.snapshot.categories ?? [];

  const incomeCats = useMemo(() => categories.filter(c => c.kind === 'income'), [categories, tick]);
  const expenseCats = useMemo(() => categories.filter(c => c.kind === 'expense'), [categories, tick]);

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color ?? '');
    setErrorMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    try {
      controller.editCategory(editingId, { name, color: editColor || undefined });
      cancelEdit();
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Failed to edit category');
    }
  };

  const startCreate = (kind: 'income' | 'expense') => {
    setCreatingKind(kind);
    setNewName('');
    setNewColor('');
    setErrorMsg(null);
  };

  const cancelCreate = () => {
    setCreatingKind(null);
    setNewName('');
    setNewColor('');
  };

  const saveCreate = () => {
    if (!creatingKind) return;
    const name = newName.trim();
    if (!name) return;
    try {
      controller.createCategory({ name, kind: creatingKind, color: newColor || undefined });
      cancelCreate();
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Failed to create category');
    }
  };

  const handleDelete = (id: string) => {
    setErrorMsg(null);
    try {
      controller.deleteCategory(id);
    } catch (e: any) {
      if (e instanceof CannotDeleteCategoryError || e?.name === 'CannotDeleteCategoryError') {
        setErrorMsg("This category is used by existing transactions or recurring commitments and can't be deleted.");
      } else {
        setErrorMsg(e.message ?? 'Failed to delete category');
      }
    }
  };

  const renderSection = (kind: 'income' | 'expense', title: string, cats: Category[]) => (
    <div className="card mb-2">
      <div className="flex-between mb-2">
        <div className="card-title">{title}</div>
        <button className="btn btn-secondary btn-small" onClick={() => startCreate(kind)} aria-label={`New ${title.toLowerCase()} category`}>
          New category
        </button>
      </div>

      {creatingKind === kind && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); saveCreate(); }}>
          <div className="field">
            <label className="label" htmlFor={`new-name-${kind}`}>Name</label>
            <input id={`new-name-${kind}`} className="input" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label className="label" htmlFor={`new-color-${kind}`}>Color (optional)</label>
            <div className="form-row">
              <input id={`new-color-${kind}`} type="color" className="input" value={newColor || '#d9a441'} onChange={e => setNewColor(e.target.value)} />
              <input className="input" value={newColor} onChange={e => setNewColor(e.target.value)} placeholder="#d9a441" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={cancelCreate}>Cancel</button>
            <button className="btn btn-primary" type="submit">Create</button>
          </div>
        </form>
      )}

      {errorMsg && <div className="field-error" role="alert">{errorMsg}</div>}

      <div className="list">
        {cats.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">🏷️</div>
            <h3>No categories</h3>
            <p>Create income or expense categories to organize transactions.</p>
          </div>
        )}
        {cats.map(cat => (
          <div key={cat.id} className="list-row">
            {editingId === cat.id ? (
              <div className="list-row-main" style={{ flex: 1 }}>
                <form onSubmit={(e) => { e.preventDefault(); saveEdit(); }} className="stack gap-1">
                  <div className="field">
                    <label className="label" htmlFor={`edit-name-${cat.id}`}>Name</label>
                    <input id={`edit-name-${cat.id}`} className="input" value={editName} onChange={e => setEditName(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`edit-color-${cat.id}`}>Color (optional)</label>
                    <div className="form-row">
                      <input id={`edit-color-${cat.id}`} type="color" className="input" value={editColor || '#d9a441'} onChange={e => setEditColor(e.target.value)} />
                      <input className="input" value={editColor} onChange={e => setEditColor(e.target.value)} placeholder="#d9a441" />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn btn-primary btn-small" type="submit">Save</button>
                    <button className="btn btn-secondary btn-small" type="button" onClick={cancelEdit}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div className="list-row-main">
                  <div className="list-row-title">
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: cat.color || 'transparent', marginRight: 8, verticalAlign: 'middle', border: '1px solid var(--border)' }} />
                    {cat.name}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="btn btn-secondary btn-small" onClick={() => startEdit(cat)} aria-label={`Edit ${cat.name} category`}>Edit</button>
                  <button className="btn btn-danger btn-small" onClick={() => handleDelete(cat.id)} aria-label={`Delete ${cat.name} category`}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="stack gap-2">
      {errorMsg && <div className="field-error" role="alert">{errorMsg}</div>}
      {renderSection('income', 'Income Categories', incomeCats)}
      {renderSection('expense', 'Expense Categories', expenseCats)}
    </div>
  );
}
