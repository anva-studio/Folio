import {useProduct} from '../../application/productNavigation';
import { useEffect, useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { reviewContent, reviewDigest } from '../../domain/financialRecords';
export function MonthlyReview({ month }: {
    month: string;
}) {
    const product=useProduct();
    const { controller, controllerRevision } = useSession(), [currentDigest, setDigest] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { let active = true; setDigest(''); if (controller)
        void reviewDigest(reviewContent(controller.snapshot, month)).then(v => { if (active)
            setDigest(v); }).catch(() => { if (active)
            setError('Could not compare review records'); }); return () => { active = false; }; }, [controller, controllerRevision, month]);
    if (!controller)
        return null;
    const review = controller.snapshot.financial?.reviews.find(r => r.month === month), completed = month < controller.getCurrentMonthKey();
    return <section className="card"><h2 className="card-title" id="monthly-review-heading" tabIndex={-1}>Review {month}</h2><p>{review ? (currentDigest ? (review.digest === currentDigest ? (product.example?'Fictional sample review.':'Reviewed by you.') : 'Records changed after your review. Review this period again.') : 'Checking reviewed records…') : 'Not reviewed. No records does not necessarily mean no financial activity.'}</p>{review && <p>Reviewed {review.reviewedAt.slice(0, 10)}{review.note ? ' · ' + review.note : ''}</p>}<p className="field-help">Review means you checked your records; it is not bank verification or a guarantee of completeness.</p>{completed && <><label className="label" htmlFor="review-note">Review note (optional)</label><textarea className="textarea" id="review-note" value={note} onChange={e => setNote(e.target.value)}/><div className="action-row"><button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try {
        await controller.reviewMonth(month, note);
        setError('');
        setNote('');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Review failed');
    }
    finally {
        setBusy(false);
    } }}>{busy ? 'Saving review…' : 'Mark reviewed'}</button>{review && <button className="btn btn-secondary" onClick={() => controller.reopenMonth(month)}>Reopen month</button>}</div><p className="field-help">Uses profile format 2.</p></>}{!completed && <p>You can mark a month reviewed after it ends.</p>}{error && <p role="alert">{error}</p>}</section>;
}
