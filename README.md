# Folio 1.1.1 — development build and run

Folio is a private, local-first financial record and planning app by ANVA: Record → Understand → Plan → Protect. It does not need a bank login or cloud account. Support is optional and opens https://buymeacoffee.com/anva only when selected. All features work without donations.

## Security update

Backup import now requires historical credentials and verifies decryption and supported financial data before any replacement. Prepared replacements are single-use and reject a changed destination. Newly created/changed passwords require at least 12 characters. KDF policy 2 uses PBKDF2-HMAC-SHA256 at 600,000 iterations; legacy 310,000-iteration profiles/backups remain supported. Password change and recovery rewrap use atomic existing mechanisms. Unlock does not silently migrate an old credential.

Inactive-screen concealment preserves an active session. Failed-save locking conceals retained work and offers retry or password-authenticated review. Android protects recent-app previews and provides optional screenshot protection. These measures do not guarantee protection against every capture mechanism.

Backup testing and restore use the same 50 MB standard file limit, with explicit Windows recovery up to 256 MB. Limits are checked before full reads, and excessive JSON nesting is rejected. Larger backups still require a reviewed recovery route. See release/1.1.1/VERIFICATION.md for acceptance limitations and exact results.

## Web

The current verified build/test runtime is Node.js 22.23.4 with npm 11.17.0. Intermittent simulated-browser authentication/worker failures remain under investigation; Node 22 also produced a jsdom worker-initialization failure after earlier passing runs. No runtime switch is claimed to resolve the test-host issue. `npm test` uses the verified serial baseline with every file/assertion enabled. `npm run test:parallel` is available for explicit test-host diagnostics and is not the acceptance baseline. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run typecheck:tests`, and `npm run build`. Serve `dist` over localhost or HTTPS. `npm run preview` provides a local production preview; opening index.html directly with file:// is not supported. The desktop and Android apps bundle these assets and work without a server or internet connection. Keep the same web origin/port to retain access to that browser's vault.

## Windows

`npm run package:windows` creates an NSIS installer in `release/windows`. `npm run desktop` runs the production web app in Electron. `npm run test:desktop` tests the packaged application's real secure origin, vault persistence, password rejection, backup and CSV downloads, and Welcome on fresh reopen, local photo processing, contact dispatch and Example lifecycle using disposable data under the workspace's work folder. Package first before running that test.

The installer is unsigned. It does not install an updater, telemetry, or cloud service. Backups and CSV exports use the normal desktop save dialog; restore uses the system file picker. Closing a window requests a normal flush and keeps it open if saving fails. Profile storage is in Electron's local userData directory and is retained on uninstall; users should still maintain encrypted backups. Chromium's browser infrastructure may have OS-managed behavior outside app code; the wrapper blocks renderer requests to external origins.

## Android

Install JDK 21 and Android SDK 36/build tools 35. Set JAVA_HOME and ANDROID_HOME if they are not discovered. `npm run android:build` synchronizes the web build and creates `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android:release` produces the unsigned release APK.

`npm run test:android` requires an already-running disposable emulator, `ANDROID_SERIAL=emulator-N` and explicit `FOLIO_RESET_SYNTHETIC_DATA=1`. The harness clears Folio's data on that emulator and refuses physical devices. Never use an emulator containing personal records. It runs every app-level instrumented test in counted batches, setting notification permission between batches externally because revoking the target application's permission kills its instrumentation process. Tests cover the bundled secure origin, AES-GCM, native export/FileProvider access, transaction entry, encrypted backup/CSV export and restore, inactivity locking, activity recreation, large profiles, notification denial/approval, reminder delivery, deduplication and cancellation.

Optional Android reminders are off by default. They provide generic weekly commitment/backup review prompts without profile names, amounts or vault access. Their settings apply to this installation, not an individual profile; Example mode cannot enable them. Notification permission is requested only when explicitly enabling a reminder. Delivery is inexact and can be delayed or prevented by Android battery settings, disabled notifications or force-stop. Reminders never record payments or create backups. No exact-alarm access or internet permission is required.

Android requires Android 7/API 24 or later with a current Android System WebView. Vaults stay in WebView local storage. OS cloud/device-transfer backup is disabled. No internet permission is requested by Folio. The explicit support link opens the user's external browser. Backup/CSV exports are written to an app-private cache folder and handed to Android's share/save chooser with a FileProvider URI. Finish saving the file before restarting Folio; stale export cache is cleared at the next start. The restore file picker selects a .folio file. Never treat a cache export as a durable backup until it is saved outside the app.

Debug APKs are for evaluation. Before public Android distribution, use ANVA's permanent release signing key; do not publish the debug signing identity. Key/passwords are deliberately not stored in this project. Physical-device backup/share/import and keyboard/back behavior still require acceptance testing.

## Data safety

In Reports, run a period comparison and open **Save or print this period report** to export CSV or a self-contained HTML report. Both preserve the analyzed dates, currency/precision, data scope, review confidence and Example identification. These files contain actual amounts even when display masking is enabled, and are unencrypted. Open the saved HTML in a browser to read offline or use Print / Save as PDF; available destinations depend on the device. They do not restore a profile.

Settings includes a backup assistant: create an encrypted file, finish saving it outside Folio, then test the saved copy without importing. A successful share request or a temporary checkbox is not verified off-device storage. Keep historical passwords/recovery credentials privately and separately; test the actual saved file. Backup export ignores repeated taps while preparing a file.

Financial amounts use integer minor units. Encryption uses PBKDF2 and AES-GCM. ANVA cannot recover passwords or financial data. Optional recovery must be enabled in advance and its credential kept safely outside Folio; it can authorize a new password, not reveal the old one. Backups contain encrypted financial records plus readable profile labels and cryptographic metadata. CSV is plaintext. An older backup needs its original password or, when configured in that backup, its original recovery credential. New credentials do not retroactively unlock older backups. Restoring over a profile replaces its data after explicit confirmation; maintain a backup of the destination first. Other open sessions become stale and cannot overwrite a restored vault, even when revisions or encrypted bytes are identical.

`npm run notices` regenerates shipped dependency license texts. `npm run icons` renders the shared Folio quill mark to the platform icons. The v1 design uses navy and warm paper themes, a restrained gold accent, tabular amounts, readable phone rows and guarded dialogs. The quill replaces the earlier letter-in-a-box mark.

## What v1 numbers mean

An account balance is its opening balance plus included transactions and explicit balance adjustments. Transfers move money between accounts and do not count as income or expenses. Excluded transactions remain in history but do not contribute to calculations. The active account total excludes archived accounts; separate Debt records are not deducted. It is not net worth or a spendable-money figure.

Recorded surplus is earned income less net expenses (expenses minus refunds) for the selected period. It is not verified savings. Dashboard and Reports show whole-month totals from current schedule templates. Open Scheduled to review individual occurrences, skips and recorded-payment links. Folio records a transaction only after you confirm it. Manual Debt plans remain separate. An explicitly linked liability account supplies the recorded debt balance; grouped payments transfer principal and record any additional interest/fees separately. Ordinary transactions are never silently matched to Debt plans.

Goals project the contribution and timeline under the chosen method. Legacy linked goals use an entire account balance and can overlap. Allocation-funded goals use explicit earmarked assignments backed by active account balances. Assignments do not create money or move balances; underfunded account assignments are flagged and contribute no claimed funded goal progress until corrected. Contributions are intentions, not automatic payments. Combined goal demand compares the active plans with an amount explicitly entered in Goals. Missing or uncalculable plans prevent an overall fit claim.

Health checks compare explicit inputs with chosen targets. They are not a credit score or comprehensive financial assessment. The surplus target is entered as a percentage; storage retains the existing ratio. Explicit shared assumptions can be saved encrypted with their date and scope, then loaded on request. Purchase scenarios can be saved and compared. You can save named savings, debt and goal comparisons in the encrypted profile. Saved comparisons retain their captured assumptions and source figures. Unsaved comparisons are temporary.

## Daily use

Start with a profile, an account and a starting balance, then record transactions and keep an encrypted backup outside the app. Transactions load 100 matching records at a time; Load more reaches the entire matching history. Filters remain while the profile is unlocked. Save and add another keeps the date, account and transaction type, clears entry-specific fields and focuses Amount. The last successfully used active account is remembered only for that unlocked session.

Unfinished entry dialogs ask before user dismissal, navigation, manual lock, Android back and desktop close. This is a dismissal guard, not a saved draft. Automatic security locking still takes priority. Browser close warnings depend on browser behavior; do not rely on them for durable drafts.

## Known release boundaries

This is unfinished development, not a release-ready handover. It supports profile currency/region selection, exact minor-unit accounting, CSV import, explicit assignments, balance checks/adjustments, and reviewed schedule associations. Populated profiles cannot be relabelled to a different currency. There is no account-level FX conversion, bank sync, cloud storage, verified net worth, overall Health Score, product recommendation or automatic payment matching. Profile encryption protects financial records at rest; readable profile labels and backup metadata remain visible. Local storage can be removed by OS/browser cleanup, uninstalling Android, or device loss; keep external backups.

The Windows installer remains unsigned. Android debug builds use a debug certificate; the release APK is unsigned and requires ANVA's permanent release key before distribution. Emulator checks do not establish physical-phone compatibility. See the consolidated release report for exact verification results and external acceptance checks.

## Welcome, example and profile identity

Every normal fresh launch opens Welcome, including returning users. Open your Folio leads to personal profiles; manual locking goes directly to the profile gate. Explore Example Profile opens a fictional Meera Rao dataset in a separate IndexedDB database, with a public demo credential. Never enter private information there. Edits persist; confirmed Reset replaces only the sample; confirmed Delete stays deleted until explicit Restore. Sample CSV exports carry a FOLIO-EXAMPLE prefix. Personal backup and import controls are absent from sample mode. Example Health/Planner figures are opt-in, temporary assumptions rather than recorded facts.

Profile photos are selected locally, center-cropped to 256 × 256 JPEG, and stored inside the encrypted profile. The locked picker always shows initials; there is no unencrypted photo cache or locked-thumbnail preference. Encrypted backups include the selected photo. Old version-1 records without optional identity/example metadata continue to load without migration.

Help contains locally searchable questions grouped by topic and is available before unlock. Contact actions explicitly open ANVA's website, email composer, feedback form or optional coffee link in external applications. Desktop and Android wrappers restrict these actions to the configured destinations. Copy app information contains app/platform details, never financial records or credentials. Copy email works independently of a configured mail client.

`npm run icons` creates the quill mark's seven-size Windows ICO, web icons, Android legacy/adaptive/monochrome and splash assets from the shared shape. The supplied Welcome artwork and fictional generated portrait are retained under build/artwork; optimized WebP copies are shipped. `npx electron scripts/completion-qa.cjs` captures the populated sample in both themes at three viewports using disposable data. See the final v1 report for package checks and genuine manual acceptance items.

## Android and small-screen polish

Mobile uses a dedicated app shell with a scrolling content region above the bottom navigation. Records opens Transactions; More opens the complete navigation sheet. Tap the unlocked identity to open profile settings and return to your previous screen. Reports provides a direct CSV-export shortcut. Goals places contribution comparisons in an expandable section. Controls, forms and action spacing are designed for touch; Android system bar contrast follows the selected theme. See scripts/mobile-qa.cjs for the five-size responsive checks. Current verification evidence and unfinished scope are recorded in the parent development directory; old v1 handover reports do not describe all current changes.
