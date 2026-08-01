# Flutter Development Guide

Practical setup/day-to-day reference for `apps/mobile`. See also
`docs/mobile/mobile-architecture-guide.md` (structure/patterns) and
`docs/mobile/api-integration-guide.md` (backend contracts).

## Prerequisites

- Flutter 3.22+ / Dart 3.4+ (`flutter --version`).
- Android: Android Studio + an SDK/emulator, or a physical device with USB
  debugging.
- iOS: a Mac with Xcode 15+ (iOS builds are impossible on Windows/Linux —
  this is an Apple platform requirement, not specific to this project).

## Project scaffolding (first-time setup)

This module's `lib/`, `pubspec.yaml`, `analysis_options.yaml`, and a
partial `android/`/`ios/` (just `AndroidManifest.xml`/`Info.plist`) were
authored in a sandbox with no Flutter SDK available at all — see
`docs/adr/0012-mobile-application.md` §8. The rest of the native Android
(`build.gradle`, `settings.gradle`, Gradle wrapper) and iOS (`.xcodeproj`,
`.xcworkspace`, `Podfile`) scaffold does **not** exist yet and cannot be
hand-authored reliably. Before anything else will build:

```bash
cd apps/mobile
flutter create --platforms=android,ios --org ai.pentesthub .
```

This generates the missing native project files **without** touching the
existing `lib/`, `pubspec.yaml`, or `AndroidManifest.xml`/`Info.plist` (it
merges/skips existing files) — if it prompts to overwrite
`AndroidManifest.xml`/`Info.plist`, decline; this repo's versions already
have the correct permissions/usage-description strings for every plugin
this app uses.

Then:

```bash
flutter pub get
```

## Code generation

`pubspec.yaml` declares `freezed`, `json_serializable`, and
`riverpod_generator` as dev dependencies, but no source file in this pass
uses their annotations (see the architecture guide's "Why plain sealed
classes" section) — `dart run build_runner build` is currently a no-op.
If/when the team adopts `@freezed`/`@riverpod` for new code:

```bash
dart run build_runner build --delete-conflicting-outputs
# or, while iterating:
dart run build_runner watch --delete-conflicting-outputs
```

## Running locally

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

`API_BASE_URL` defaults to `http://localhost:3000` (see
`core/config/env.dart`) — matching `apps/api`'s default dev port. Point it
at a real host for a device on the same network (`http://<your-lan-ip>:3000`,
not `localhost`, since the device isn't the host).

## Verification loop

```bash
flutter analyze --fatal-infos
flutter test
flutter build apk --release        # Android
flutter build ios --release --no-codesign   # iOS build-config validation (macOS only)
```

None of these have been run against this module's source yet — see the
release notes' "Known limitations" and run this loop for real before
merging.

## Certificate pinning (release builds)

`core/network/certificate_pinning.dart` reads pins from
`--dart-define=CERT_PINS=<comma-separated base64 SHA-256 SPKI hashes>`.
Empty (the default) disables pinning entirely — required for local dev
against a self-signed/dev cert. To compute a pin for a real deployment's
TLS certificate:

```bash
openssl s_client -connect api.pentesthub.ai:443 -servername api.pentesthub.ai </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | base64
```

Pin both the leaf and its issuing intermediate so a routine cert renewal
(same CA, new leaf) doesn't break the app.

## Releasing

Android needs a release keystore (`ANDROID_KEYSTORE_BASE64`/
`ANDROID_KEYSTORE_PASSWORD`/`ANDROID_KEY_ALIAS`/`ANDROID_KEY_PASSWORD` —
wired as GitHub Actions secrets in `.github/workflows/mobile-ci.yml`) and
a Play Console service-account JSON (`PLAY_JSON_KEY_FILE`, used by
`android/fastlane/Fastfile`). iOS needs an Apple Developer account, a
Fastlane `match` git/S3 repo for certificate/profile management
(`MATCH_GIT_URL`/`MATCH_PASSWORD`), and `APPLE_ID`/
`APP_STORE_CONNECT_TEAM_ID`/`APPLE_DEVELOPER_TEAM_ID` — see
`ios/fastlane/Fastfile`. None of these secrets exist yet; set them up per
your own Google Play/App Store Connect accounts before running the
`beta`/`internal` Fastlane lanes.
