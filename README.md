# Folio 1.0.0 — build and run

Folio is a private, local-first financial record and planning app by ANVA: Record → Understand → Plan → Protect. It does not need a bank login or cloud account. Support is optional and opens https://buymeacoffee.com/anva only when selected. All features work without donations.

## Web

Install Node.js 22 or newer, then run `npm ci`, `npm test`, `npm run typecheck`, `npm run typecheck:tests`, and `npm run build`. Serve `dist` over localhost or HTTPS. `npm run preview` provides a local production preview; opening index.html directly with file:// is not supported. The desktop and Android apps bundle these assets and work without a server or internet connection. Keep the same web origin/port to retain access to that browser's vault.

## Windows

`npm run package:windows` creates an NSIS installer in `release/windows`. `npm run desktop` runs the production web app in Electron. `npm run test:desktop` tests the packaged application's real secure origin, vault persistence, password rejection, backup and CSV downloads, and Welcome on fresh reopen, local photo processing, contact dispatch and Example lifecycle using disposable data under the workspace's work folder. Package first before running that test.

The installer is unsigned. It does not install an updater, telemetry, or cloud service. Backups and CSV exports use the normal desktop save dialog; restore uses the system file picker. Closing a window requests a normal flush and keeps it open if saving fails. Profile storage is in Electron's local userData directory and is retained on uninstall; users should still maintain encrypted backups. Chromium's browser infrastructure may have OS-managed behavior outside app code; the wrapper blocks renderer requests to external origins.

## Android

Install JDK 21 and Android SDK 36/build tools 35. Set JAVA_HOME and ANDROID_HOME if they are not discovered. `npm run android:build` synchronizes the web build and creates `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android:release` produces the unsigned release APK. `npm run test:android` runs Folio's app-level instrumented tests on an already-running disposable emulator/device. Tests use synthetic data and create test profiles. They check the bundled secure origin, AES-GCM, native export/FileProvider access, actual transaction entry, encrypted backup and CSV export, restore, resume after an inactivity deadline, and persistence across activity recreation.

Android requires Android 7/API 24 or later with a current Android System WebView. Vaults stay in WebView local storage. OS cloud/device-transfer backup is disabled. No internet permission is requested by Folio. The explicit support link opens the user's external browser. Backup/CSV exports are written to an app-private cache folder and handed to Android's share/save chooser with a FileProvider URI. Finish saving the file before restarting Folio; stale export cache is cleared at the next start. The restore file picker selects a .folio file. Never treat a cache export as a durable backup until it is saved outside the app.

Debug APKs are for evaluation. Before public Android distribution, use ANVA's permanent release signing key; do not publish the debug signing identity. Key/passwords are deliberately not stored in this project. Physical-device backup/share/import and keyboard/back behavior still require acceptance testing.

## Data safety

Financial amounts use integer minor units. Encryption uses PBKDF2 and AES-GCM; passwords cannot be recovered. Backups contain encrypted financial records plus readable profile labels and cryptographic metadata. CSV is plaintext. An older backup needs the password in effect when it was made. Restoring over a profile replaces its data after explicit confirmation; maintain a backup of the destination first. Other open sessions become stale and cannot overwrite a restored vault, even when revisions or encrypted bytes are identical.

`npm run notices` regenerates shipped dependency license texts. `npm run icons` renders the shared Folio quill mark to the platform icons. The v1 design uses navy and warm paper themes, a restrained gold accent, tabular amounts, readable phone rows and guarded dialogs. The quill replaces the earlier letter-in-a-box mark.

## What v1 numbers mean

An account balance is its opening balance plus included transactions. Transfers move money between accounts and do not count as income or expenses. Excluded transactions remain in history but do not contribute to calculations. The active account total excludes archived accounts; separate Debt records are not deducted. It is not net worth or a spendable-money figure.

Recorded surplus is recorded income less expenses for the selected period. It is not verified savings. Scheduled amounts are independent whole-month expectations; they do not indicate paid or unpaid money and never create transactions automatically. Debt plans are maintained manually: recording a payment does not reduce a Debt balance.

Goals project the contribution and timeline under the chosen method. Linked goals use an entire account balance and can overlap. Contributions are intentions, not automatic payments or exclusive allocations. Combined goal demand compares the active plans with an amount explicitly entered in Goals. Missing or uncalculable plans prevent an overall fit claim.

Health checks compare explicit inputs with chosen targets. They are not a credit score or comprehensive financial assessment. The surplus target is entered as a percentage; storage retains the existing ratio. Planner inputs and Goals' available-amount input are temporary and specific to their screen. Navigating away or locking can clear them. No shared planning assumptions are persisted or inferred.

## Daily use

Start with a profile, an account and a starting balance, then record transactions and keep an encrypted backup outside the app. Transactions load 100 matching records at a time; Load more reaches the entire matching history. Filters remain while the profile is unlocked. Save and add another keeps the date, account and transaction type, clears entry-specific fields and focuses Amount. The last successfully used active account is remembered only for that unlocked session.

Unfinished entry dialogs ask before user dismissal, navigation, manual lock, Android back and desktop close. This is a dismissal guard, not a saved draft. Automatic security locking still takes priority. Browser close warnings depend on browser behavior; do not rely on them for durable drafts.

## Known release boundaries

v1 uses the existing INR money model. There is no bank sync, cloud storage, allocation ledger, payment matching, reconciliation, verified net worth, Health Score, investment guidance, or CSV import. Archive/exclusion financial semantics are unchanged. Profile encryption protects financial records at rest; readable profile labels and backup metadata remain visible. Local storage can be removed by OS/browser cleanup, uninstalling Android, or device loss; keep external backups.

The Windows installer remains unsigned. Android debug builds use a debug certificate; the release APK is unsigned and requires ANVA's permanent release key before distribution. Emulator checks do not establish physical-phone compatibility. See the consolidated release report for exact verification results and external acceptance checks.

## Welcome, example and profile identity

Every normal fresh launch opens Welcome, including returning users. Open your Folio leads to personal profiles; manual locking goes directly to the profile gate. Explore Example Profile opens a fictional Meera Rao dataset in a separate IndexedDB database, with a public demo credential. Never enter private information there. Edits persist; confirmed Reset replaces only the sample; confirmed Delete stays deleted until explicit Restore. Sample CSV exports carry a FOLIO-EXAMPLE prefix. Personal backup and import controls are absent from sample mode. Example Health/Planner figures are opt-in, temporary assumptions rather than recorded facts.

Profile photos are selected locally, center-cropped to 256 × 256 JPEG, and stored inside the encrypted profile. The locked picker always shows initials; there is no unencrypted photo cache or locked-thumbnail preference. Encrypted backups include the selected photo. Old version-1 records without optional identity/example metadata continue to load without migration.

Help contains 43 locally searchable questions across 16 categories and is available before unlock. Contact actions explicitly open ANVA's website, email composer, feedback form or optional coffee link in external applications. Desktop and Android wrappers restrict these actions to the configured destinations. Copy app information contains app/platform details, never financial records or credentials. Copy email works independently of a configured mail client.

`npm run icons` creates the quill mark's seven-size Windows ICO, web icons, Android legacy/adaptive/monochrome and splash assets from the shared shape. The supplied Welcome artwork and fictional generated portrait are retained under build/artwork; optimized WebP copies are shipped. `npx electron scripts/completion-qa.cjs` captures the populated sample in both themes at three viewports using disposable data. See the final v1 report for package checks and genuine manual acceptance items.
