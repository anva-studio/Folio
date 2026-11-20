import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { CannotDeleteCategoryError } from '../../application/folioController.js';
import type { Category } from '../../domain/types.js';

type Draft = { kind: Category['kind']; id?: string; name: string; color: string };
const groups = [
  { kind: 'income', title: 'Income categories', suggestions: ['Pay', 'Freelance', 'Other income'] },
  { kind: 'expense', title: 'Expense categories', suggestions: ['Groceries', 'Housing', 'Transport', 'Utilities'] },
] as const;

export default function CategoryManager() {
  const { controller, controllerRevision } = useSession();
  const snapshot = useMemo(() => controller?.snapshot, [controller, controllerRevision]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft>();
  const [pendingDelete, setPendingDelete] = useState<Category>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const nameField = useRef<HTMLInputElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef(false);
  const references = useMemo(() => {
    const used = new Set<string>();
    for (const transaction of snapshot?.txns ?? []) {
      if (transaction.categoryId) used.add(transaction.categoryId);
      for (const split of transaction.splits ?? []) used.add(split.categoryId);
    }
    for (const schedule of snapshot?.recurring ?? []) {
      if (schedule.categoryId) used.add(schedule.categoryId);
    }
    for (const target of snapshot?.financial?.targets ?? []) used.add(target.categoryId);
    return used;
  }, [snapshot]);
  useLayoutEffect(() => {
    if (draft) nameField.current?.focus();
    else if (!pendingDelete && returnFocus.current) {
      returnFocus.current = false;
      if (trigger.current?.isConnected) trigger.current.focus();
      else searchField.current?.focus();
    }
  }, [draft?.kind, draft?.id, pendingDelete]);

  if (!controller || !snapshot) return null;
  const filter = query.trim().toLocaleLowerCase();
  const visible = snapshot.categories.filter(category => category.name.toLocaleLowerCase().includes(filter));

  function begin(next: Draft, button: HTMLButtonElement) {
    trigger.current = button;
    setDraft(next);
    setError('');
    setStatus('');
  }

  function finish(message = '') {
    setDraft(undefined);
    setPendingDelete(undefined);
    setError('');
    setStatus(message);
    returnFocus.current = true;
  }

  function save() {
    if (!controller || !draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Enter a category name.');
      nameField.current?.focus();
      return;
    }
    try {
      const color = draft.color.trim() || undefined;
      if (draft.id) controller.editCategory(draft.id, { name, color });
      else controller.createCategory({ name, kind: draft.kind, color });
      if (filter && !name.toLocaleLowerCase().includes(filter)) setQuery('');
      finish(draft.id ? 'Category updated.' : 'Category created.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save category.');
    }
  }

  function remove(category: Category) {
    if (!controller) return;
    try {
      controller.deleteCategory(category.id);
      trigger.current = null;
      finish('Category deleted.');
    } catch (cause) {
      setError(cause instanceof CannotDeleteCategoryError
        ? "This category can't be deleted while records use it."
        : cause instanceof Error ? cause.message : 'Unable to delete category.');
    }
  }

  return <div className="category-manager">
    <div className="field">
      <label className="label" htmlFor="category-search">Search categories</label>
      <input id="category-search" ref={searchField} className="input" type="search" data-dialog-filter
        value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="category-status" role="status">{status}</p>
    {draft && <form className="category-editor" onSubmit={event => { event.preventDefault(); save(); }}>
      <h3>{draft.id ? 'Edit' : 'New'} {draft.kind} category</h3>
      <div className="field">
        <label className="label" htmlFor="category-name">Name</label>
        <input id="category-name" ref={nameField} className="input" value={draft.name}
          onChange={event => setDraft({ ...draft, name: event.target.value })} />
      </div>
      {!draft.id && <div className="category-actions" aria-label="Name suggestions">
        {groups.find(group => group.kind === draft.kind)?.suggestions.map(name =>
          <button key={name} type="button" className="btn btn-secondary" onClick={() => {
            setDraft({ ...draft, name });
            nameField.current?.focus();
          }}>{name}</button>)}
      </div>}
      <div className="field">
        <label className="label" htmlFor="category-color">Color code (optional)</label>
        <div className="category-color-fields">
          <input className="input" type="color" aria-label="Choose category color"
            value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#d9a441'}
            onChange={event => setDraft({ ...draft, color: event.target.value })} />
          <input id="category-color" className="input" placeholder="#d9a441" value={draft.color}
            onChange={event => setDraft({ ...draft, color: event.target.value })} />
        </div>
      </div>
      <div className="category-actions">
        <button type="submit" className="btn btn-primary">{draft.id ? 'Save' : 'Create'}</button>
        <button type="button" className="btn btn-secondary" onClick={() => finish()}>Cancel {draft.id ? 'edit' : 'creation'}</button>
      </div>
    </form>}
    {pendingDelete && <section className="category-editor" aria-labelledby="category-delete-title">
      <h3 id="category-delete-title">Delete {pendingDelete.name}?</h3>
      <div className="category-actions">
        <button type="button" className="btn btn-secondary" autoFocus onClick={() => finish()}>Keep category</button>
        <button type="button" className="btn btn-danger" onClick={() => remove(pendingDelete)}>Delete category</button>
      </div>
    </section>}
    {groups.map(group => {
      const categories = visible.filter(category => category.kind === group.kind);
      return <section key={group.kind} className="category-group" aria-labelledby={'category-group-' + group.kind}>
        <div className="category-group-heading">
          <h3 id={'category-group-' + group.kind}>{group.title}</h3>
          <button type="button" className="btn btn-secondary" aria-label={'New ' + group.kind + ' category'}
            disabled={!!draft || !!pendingDelete}
            onClick={event => begin({ kind: group.kind, name: '', color: '' }, event.currentTarget)}>New category</button>
        </div>
        {!categories.length && <p className="field-help">{filter ? 'No matching categories.' : 'No categories yet.'}</p>}
        <ul className="category-list">
          {categories.map(category => <li key={category.id} className="category-row">
            <div className="category-name">
              {category.color && <span aria-hidden="true" className="category-swatch" style={{ backgroundColor: category.color }} />}
              <strong>{category.name}</strong>
              {references.has(category.id) && <span className="field-help">In use</span>}
            </div>
            <div className="category-actions">
              <button type="button" className="btn btn-secondary" aria-label={'Edit ' + category.name + ' category'}
                disabled={!!draft || !!pendingDelete}
                onClick={event => begin({ ...category, color: category.color ?? '' }, event.currentTarget)}>Edit</button>
              <button type="button" className="btn btn-secondary" aria-label={'Delete ' + category.name + ' category'}
                disabled={!!draft || !!pendingDelete}
                onClick={event => {
                  setStatus('');
                  setError('');
                  if (references.has(category.id)) {
                    setError("This category can't be deleted while transactions, schedules, or spending targets use it.");
                    return;
                  }
                  trigger.current = event.currentTarget;
                  setPendingDelete(category);
                }}>Delete</button>
            </div>
          </li>)}
        </ul>
      </section>;
    })}
  </div>;
}
