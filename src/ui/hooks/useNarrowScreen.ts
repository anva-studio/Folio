import { useEffect, useState } from 'react';
export function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() => typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 700px)').matches : window.innerWidth <= 700);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 700px)');
    const change = () => setNarrow(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return narrow;
}
