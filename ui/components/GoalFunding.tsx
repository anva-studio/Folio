import { useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import type { Goal } from '../../domain/types';
export function GoalFunding({ goal }: {
    goal: Goal;
}) { const { controller } = useSession(), [error, setError] = useState(''); return <div className="field"><label className="label" htmlFor={'goal-funding-' + goal.id}>Progress source</label><select className="select" aria-label={goal.name + ' progress source'} id={'goal-funding-' + goal.id} value={goal.funding ?? 'legacy'} onChange={e => { try {
    controller?.setGoalFunding(goal.id, e.target.value as 'legacy' | 'allocations');
    setError('');
}
catch (err) {
    setError(err instanceof Error ? err.message : 'Could not change source');
} }}><option value="legacy">Original manual / linked-account figure</option><option value="allocations">Funded allocations only</option></select>{error && <p role="alert">{error}</p>}</div>; }
