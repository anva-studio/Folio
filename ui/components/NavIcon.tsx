const paths: Record<string,string> = {
 dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 accounts:'M3 7h18v13H3z M3 7l9-4 9 4 M7 11v5 M12 11v5 M17 11v5',
 transactions:'M4 7h15 M15 3l4 4-4 4 M20 17H5 M9 13l-4 4 4 4',
 recurring:'M19 8a8 8 0 0 0-13-2 L3 9 M3 4v5h5 M5 16a8 8 0 0 0 13 2l3-3 M21 20v-5h-5',
 debts:'M4 5h16v14H4z M4 10h16 M7 15h4',
 goals:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 10v4 M10 12h4',
 health:'M3 12h4l3-7 4 14 3-7h4',
 planner:'M4 3h16v18H4z M8 7h8 M8 12h2 M14 12h2 M8 17h2 M14 17h2',
 reports:'M4 20V4 M4 20h17 M8 16v-4 M13 16V8 M18 16V5',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
 about:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7v1',
};
export function NavIcon({name}:{name:string}) { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.about}/></svg>; }
