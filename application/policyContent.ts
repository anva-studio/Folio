export type PolicyPage = {
  id: string;
  title: string;
  summary: string;
  sections: { title: string; text: string }[];
};

/** Factual product disclosures. Contractual terms require a separate owner decision. */
export const POLICY_PAGES: PolicyPage[] = [
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    summary: 'How Folio stores records, handles exports and opens external services.',
    sections: [
      { title: 'Scope', text: 'This page describes the Folio app. ANVA’s website, email, feedback form and support platform are separate services. Contact ANVA at Anvahq@gmail.com with privacy questions.' },
      { title: 'Records on your device', text: 'Personal financial records and the authoritative profile photo are encrypted in local app or browser storage. Folio does not upload these records to ANVA and includes no analytics or telemetry. Profile labels and format metadata remain readable so the app can list profiles. The passwordless Example Profile contains fictional data and provides no private storage.' },
      { title: 'Device preferences and permissions', text: 'Appearance, amount masking, landing preferences and Android reminder settings are stored on the device separately from financial backups. Android reminders are optional and use notification permission when enabled. Notifications contain generic review prompts. Folio does not request contacts, camera, location or bank access.' },
      { title: 'Files you save or share', text: 'Encrypted .folio backups keep financial records encrypted, with readable labels and metadata. CSV and printable HTML reports contain readable financial data, including actual amounts when display masking is on. Recovery credential files are unencrypted. Android prepares exports in a temporary app cache and sends them to the destination you choose. The receiving app, storage provider or person can retain a copy. Finish saving outside Folio and check the resulting file.' },
      { title: 'External services and messages', text: 'Website, email, feedback and optional support links open another application only when selected. Folio does not attach financial records through these links. If you submit a message or form, the information you enter goes to that service and potentially ANVA. Those services have their own privacy practices. Do not include passwords, recovery credentials or private records in a support request. AI-assisted development does not send your financial records to an AI service through Folio.' },
      { title: 'Deletion and recovery', text: 'Deleting a profile removes its local saved records. It does not delete backups, exports, printed reports or copies held by other apps. Folio does not promise secure erasure from device storage. Clearing storage, Android uninstall or device loss can remove local records. Keep an encrypted backup outside the installation. Recovery requires a credential deliberately enabled and saved before a password is lost. ANVA cannot retrieve local records or reset a password for you.' },
      { title: 'Unlocked screens and device access', text: 'Encryption protects stored financial records. While a profile is unlocked, records are available to the app. Folio conceals its screen during inactive transitions. Android recent-app previews are protected where supported; optional screenshot blocking is available in Settings. Screenshots, screen recordings, operating-system caches and external cameras are not universally prevented. Amount masking does not hide every detail. Lock Folio when leaving it unattended and protect access to the device.' },
    ],
  },
  {
    id: 'use-limitations',
    title: 'Use & financial limitations',
    summary: 'What recorded figures and planning estimates mean, and how to protect your own copies.',
    sections: [
      { title: 'Personal records and estimates', text: 'Folio works from records and assumptions you enter. It does not verify them against a bank or lender. Missing records, duplicated entries and stale assumptions affect results. Check important figures against your statements before making a decision. Planning and Health checks provide general comparisons, without a credit rating, financial advice or guaranteed outcomes.' },
      { title: 'Balances and planned money', text: 'The active account total covers active accounts and their included recorded movements and adjustments. Separate manual Debt plans are not deducted again. It is not verified net worth or a safe-to-spend amount. Recorded surplus is income less net expenses for a period, rather than verified savings. Schedules describe expectations until you explicitly record and review a payment. Earmarks assign existing money and do not move it.' },
      { title: 'Currency and completeness', text: 'Each profile has one currency. Regional display changes do not convert stored money. Folio offers no account-level exchange-rate conversion. Monthly reviews are self-reported. A reviewed month and an authenticated backup do not independently prove that records are complete.' },
      { title: 'Password choice', text: 'New or changed passwords need at least 12 characters, with a long, unique passphrase recommended. Existing passwords remain usable for unlock. Recovery credentials are separate generated secrets. Encryption cannot prevent someone with a vault copy from trying password guesses outside Folio. Avoid sharing a password with another service. Folio cannot remove copies that someone already has.' },
      { title: 'Keeping access', text: 'Keep a current encrypted backup outside Folio and test the saved file. Protect historical passwords and recovery credentials separately from backups. A new password or replacement credential does not revoke copies of old backups. CSV and printable reports cannot restore a complete profile. Delete or replace records only after preserving any copy you need.' },
    ],
  },
  {
    id: 'licenses',
    title: 'Licenses & credits',
    summary: 'Bundled third-party license texts and Folio’s existing technology credits.',
    sections: [
      { title: 'Credits', text: 'Folio by ANVA. Built with React and Capacitor, with Electron for Windows. These components have their own licenses. Their permissions apply to the respective components.' },
      { title: 'Bundled notices', text: 'Third-party JavaScript license texts are included below and in THIRD-PARTY-NOTICES.txt. Windows distributions also retain Electron’s LICENSE and LICENSES.chromium.html. Dependency licenses do not establish the license for ANVA’s own application code or artwork.' },
    ],
  },
];

