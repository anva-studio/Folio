# Folio 1.1.1 source package

Extract the Folio-1.1.1-source folder as the repository root. This snapshot contains the application, Windows and Android projects, artwork/icons, lockfile, Gradle wrapper and regression tests.

## Build

Use Node.js 22.23.4 and a compatible npm 11 installation.

    npm ci
    npm test
    npm run typecheck
    npm run typecheck:tests
    npm run build

For Windows packaging run npm run package:windows.

For Android install JDK 21 and Android SDK 36, configure JAVA_HOME and ANDROID_HOME as needed, then run npm run android:build or npm run android:release. These commands synchronize Capacitor assets first. Android release packaging produces an unsigned APK. Use ANVA's existing production key through a private local signing workflow.

The archive carries executable ZIP metadata for android/gradlew. If your extraction/upload workflow loses it, restore its executable bit before using Gradle on Unix.

## Tests and fixtures

test/fixtures/released-1.0.0.folio is the preserved synthetic compatibility fixture. Its public test credential is documented in PROVENANCE.json. The debug-only performance backup contains 50,000 fictional records and uses public-performance-password. These files deliberately belong in the test source. Keep actual financial backups outside the repository.

Native instrumentation requires an owned disposable emulator and explicitly resets its synthetic Folio data. Read scripts/android-instrumentation.mjs before running npm run test:android.

## Snapshot and publication status

The final development verification passed 94 files / 782 tests, 14 Android emulator checks and 20 packaged Windows workflows. Signing, installed upgrades and physical-device acceptance remain owner-managed. Version 1.1.1 remains a release candidate with manual checks outstanding.

The archive's .gitignore adds protection for verification output and financial backups while retaining the two public synthetic fixtures. Application code is copied unchanged. SOURCE-SHA256SUMS.txt inventories the included files.

ANVA still needs to choose an application license and confirm redistribution rights for its source and assets. Third-party license texts retain their own terms. Review that decision before publishing the repository.
