.PHONY: dev prod demo demo-down down migrate logs deploy backup audit logs-files logs-errors logs-files-prod logs-errors-prod logs-files-prod-tail logs-errors-prod-tail logs-prod logs-backend-prod logs-frontend-prod logs-caddy-prod logs-postgres-prod logs-prod-tail logs-backend-prod-tail logs-frontend-prod-tail logs-caddy-prod-tail logs-postgres-prod-tail mobile-build ios android android-bundle android-dev android-prod android-demo ios-dev ios-prod android-logcat

# Overridable line count for every *-tail target below, e.g. `make logs-backend-prod-tail TAIL=300`.
TAIL ?= 100

dev:
	docker compose -f infra/docker-compose.yml up --build -V

# Also seeds a real Play Store / App Store reviewer login into the
# production database (infra/playstore-demo-seed.sh, backend/prisma/
# seed-playstore-demo.ts) — Google Play's pre-launch review and Apple's App
# Review both require working demo credentials, which this account provides
# via the app's normal email/password login (never DEMO_MODE, which stays
# off in production — see `demo` below). One-time in practice: the seed
# no-ops once the account exists, and it then survives every later `make
# deploy` since that never touches the database. See android-prod/ios-prod
# below for where this account actually gets reviewed.
prod:
	docker compose -f infra/docker-compose.prod.yml up --build -d
	sh infra/playstore-demo-seed.sh

# Throwaway sales-demo stack — same dev image/mounts as `make dev` (infra/
# docker-compose.yml), just brought up under its own compose project name
# (`-p facturele-demo`) so it gets its own containers/network/volume,
# entirely separate from your real dev database. Populates itself with two
# fictitious tenants (an artisan du bâtiment and an institut de beauté —
# see backend/prisma/seed-demo.ts) via infra/demo-seed.sh, so there's
# real-looking data to click through in front of a prospect/investor.
# DEMO_MODE=true (read by infra/docker-compose.yml's backend service) turns
# on the login page's one-click "Démo — accès en un clic" buttons — see
# backend/src/auth/guards/demo-mode-enabled.guard.ts. Since it reuses the
# same host ports as `make dev` (infra/.env), the two can't run at the same
# time — stop one before starting the other.
demo:
	DEMO_MODE=true docker compose -f infra/docker-compose.yml -p facturele-demo up --build -d -V
	sh infra/demo-seed.sh

# Tears the demo stack down AND destroys its database volume (`down -v`,
# unlike the shared `down` target below) — every `make demo` therefore
# starts from a clean, freshly-seeded slate.
demo-down:
	docker compose -f infra/docker-compose.yml -p facturele-demo down -v

down:
	docker compose -f infra/docker-compose.yml down
	docker compose -f infra/docker-compose.prod.yml down

migrate:
	docker compose -f infra/docker-compose.yml exec backend npx prisma migrate dev

logs:
	docker compose -f infra/docker-compose.yml logs -f

# Rotated log files written by backend/src/logging/ (see docs/logging.md) —
# survive container restarts/recreation, unlike `make logs` above (Docker's
# own log driver). Dev bind-mounts the whole backend/ dir, so the files are
# just there on the host; prod keeps them in a named volume, only reachable
# through the running container.
logs-files:
	tail -f backend/logs/combined-*.log

logs-errors:
	tail -f backend/logs/error-*.log

logs-files-prod:
	docker compose -f infra/docker-compose.prod.yml exec backend tail -f logs/combined-*.log

logs-errors-prod:
	docker compose -f infra/docker-compose.prod.yml exec backend tail -f logs/error-*.log

# One-shot (no -f) bounded dumps of the two targets above — last $(TAIL)
# lines then exit, instead of an open `tail -f` session. Meant for pasting a
# snapshot somewhere (a chat, an issue) rather than watching live.
logs-files-prod-tail:
	docker compose -f infra/docker-compose.prod.yml exec backend tail -n $(TAIL) logs/combined-*.log

logs-errors-prod-tail:
	docker compose -f infra/docker-compose.prod.yml exec backend tail -n $(TAIL) logs/error-*.log

# Docker's own log driver for the prod stack (same idea as `logs` above,
# just pointed at docker-compose.prod.yml) — only goes back as far as
# Docker's retention and disappears if a container is recreated, unlike
# logs-files-prod/logs-errors-prod above (backend's own rotated files, which
# survive that). Still the only log source at all for postgres/frontend/
# caddy, which don't write their own log files anywhere else. Run these on
# the VPS itself, against a repo checkout already running `make prod` — same
# as `deploy`/`backup` below.
logs-prod:
	docker compose -f infra/docker-compose.prod.yml logs -f

logs-backend-prod:
	docker compose -f infra/docker-compose.prod.yml logs -f backend

logs-frontend-prod:
	docker compose -f infra/docker-compose.prod.yml logs -f frontend

logs-caddy-prod:
	docker compose -f infra/docker-compose.prod.yml logs -f caddy

logs-postgres-prod:
	docker compose -f infra/docker-compose.prod.yml logs -f postgres

# Same four, bounded to the last $(TAIL) lines instead of Docker's full
# buffered history — the plain `logs -f` targets above replay everything
# since container start before following, which is unreadable on a
# long-running VPS. Still follows after that initial dump (`-f` stays); drop
# it yourself for a true one-shot snapshot, e.g.:
#   docker compose -f infra/docker-compose.prod.yml logs --tail=100 backend
logs-prod-tail:
	docker compose -f infra/docker-compose.prod.yml logs -f --tail=$(TAIL)

logs-backend-prod-tail:
	docker compose -f infra/docker-compose.prod.yml logs -f --tail=$(TAIL) backend

logs-frontend-prod-tail:
	docker compose -f infra/docker-compose.prod.yml logs -f --tail=$(TAIL) frontend

logs-caddy-prod-tail:
	docker compose -f infra/docker-compose.prod.yml logs -f --tail=$(TAIL) caddy

logs-postgres-prod-tail:
	docker compose -f infra/docker-compose.prod.yml logs -f --tail=$(TAIL) postgres

# Real-server commands (see docs/deployment.md) — run these against a repo
# checkout already running `make prod`, e.g. on the OVH VPS.
deploy:
	sh infra/deploy.sh

backup:
	sh infra/backup.sh

# Read-only check of backend/.env and infra/.env: flags missing required
# secrets, dev-only defaults left in place, secrets that look too short to be
# a real generated value, and optional features (Stripe, Google OAuth, system
# email, push, ...) that are half-configured or simply not set. Never prints
# a secret's value. Safe to run anytime, including against prod.
audit:
	sh infra/audit-config.sh

# Phase 22 mobile app (see docs/roadmap.md) — builds the production Angular
# bundle and syncs it, plus every installed Capacitor plugin, into
# frontend/ios/ and frontend/android/. Requires Xcode (with an active full
# developer directory, not just the Command Line Tools) for `ios`, and
# Android Studio / the Android SDK for `android` — neither is installed by
# this target, only invoked.
#
# By default this points the app at the real API domain
# (frontend/capacitor.config.ts). To test against a backend running on your
# own machine from the iOS Simulator / an Android emulator instead, pass
# your LAN IP (findable via `ipconfig getifaddr en0` on macOS):
#   make ios LOCAL_HOST=192.168.1.23
# That also needs the matching dev-only ATS/cleartext exception uncommented
# in frontend/ios/App/App/Info.plist or
# frontend/android/app/src/main/AndroidManifest.xml — see the comments
# there, and never leave either uncommented in a release build.
mobile-build:
	cd frontend && npx ng build --configuration production
	cd frontend && CAPACITOR_LOCAL_HOST=$(LOCAL_HOST) npx cap sync

# Opens the Xcode workspace — build/run from there (Product > Run), same as
# any other Xcode project. First run needs `npx cap add ios`'s output
# already committed (it is) and Firebase's iOS SDK added as a Swift Package
# dependency to the "App" target (File > Add Package Dependencies) before
# push notifications work — see frontend/ios/App/App/AppDelegate.swift.
ios: mobile-build
	cd frontend && npx cap open ios

# Opens the project in Android Studio — build/run from there, or
# `cd frontend/android && ./gradlew assembleDebug` for a CLI build. Needs a
# real google-services.json in frontend/android/app/ before push
# notifications work (Firebase console > Project settings > your Android
# app) — the Google Services Gradle plugin is already wired in and only
# activates once that file exists (frontend/android/app/build.gradle).
android: mobile-build
	cd frontend && npx cap open android

# Builds the signed .aab straight from the CLI — no Android Studio detour
# needed (`android` above only opens the IDE and leaves Build > Generate
# Signed App Bundle as a manual click). Same release signingConfig as
# android-prod's assembleRelease below (frontend/android/app/build.gradle,
# keyed off frontend/android/keystore.properties — gitignored, must already
# have storePassword/keyPassword filled in), but the bundleRelease Gradle
# task instead of assembleRelease: Play Console only accepts the .aab
# format, never a plain APK. Always the real API domain (facturele.net),
# same as `android`/`android-prod` — a Play Store upload can only ever be
# the production build, so there's no LOCAL_HOST variant of this target.
#
# Gradle's own output path (frontend/android/app/build/outputs/bundle/
# release/app-release.aab) sits inside the gitignored build/ dir and moves
# around with Gradle/AGP versions — copied here to a fixed, predictable
# path instead, so "the file to upload to Play Console" is always the same
# location.
#
# JAVA_HOME is forced to JDK 21 (macOS's own `java_home` picker, falling
# back to whatever was already set if 21 isn't installed) rather than
# trusting whatever `java` happens to resolve on PATH: this Gradle version
# (8.14.3, frontend/android/gradle/wrapper/gradle-wrapper.properties) can't
# parse build.gradle at all under a too-new JDK — fails with "BUG!
# exception in phase 'semantic analysis' ... Unsupported class file major
# version" — and which JDK is "default" on a machine with several installed
# isn't reliably the same one build to build. 21 matches Android Studio's
# own bundled JBR, so CLI builds behave the same as IDE ones.
#
# Play Console rejects re-uploading a versionCode it's already seen, and
# every android-bundle run is meant to be uploaded — so this bumps
# defaultConfig.versionCode/versionName in frontend/android/app/build.gradle
# itself first (frontend/scripts/bump-android-version.sh) rather than
# leaving that as a manual step to remember. That's a real edit to a
# committed file — `git status` will show it after this runs; commit it as
# part of shipping that release.
android-bundle: mobile-build
	sh frontend/scripts/bump-android-version.sh
	cd frontend/android && JAVA_HOME=$$(/usr/libexec/java_home -v 21 2>/dev/null || echo "$$JAVA_HOME") ./gradlew bundleRelease
	mkdir -p frontend/android/releases
	cp frontend/android/app/build/outputs/bundle/release/app-release.aab frontend/android/releases/app-release.aab
	@echo "==> .aab prêt à uploader : frontend/android/releases/app-release.aab"

# Same app as `ios`/`android` above, but built and installed straight onto a
# running emulator/simulator (frontend/scripts/run-{android,ios}.sh) — no
# Xcode/Android Studio window to click through, closer to "install it like
# it came from the store": release build, real app icon, no dev server
# attached. Still requires the same Xcode/Android SDK prerequisites as
# `ios`/`android`, an already-booted (or bootable) emulator/simulator, and
# for *-dev, a backend actually reachable on your LAN — see the scripts'
# own comments for exactly what each mode does.
#   make android-dev LOCAL_HOST=10.0.2.2   # backend on your machine
#   make android-prod                            # real API domain
#   make ios-dev LOCAL_HOST=10.0.2.2
#   make ios-prod
#
# *-prod builds point at the real API domain, which is what Google
# Play/Apple actually review — that's the account `make prod` seeds (see
# above): store-review@facturele.app, typed into the app's normal login
# form, entered as the reviewer credentials in Play Console's "app access"
# section / App Store Connect's review notes.
android-dev:
	sh frontend/scripts/run-android.sh dev $(LOCAL_HOST)

android-prod:
	sh frontend/scripts/run-android.sh prod

# Screenshot/walkthrough build: brings up the throwaway `make demo` stack
# (facturele-demo project, seeded with the two fictitious tenants — see
# infra/demo-seed.sh) and installs a dev-mode build of the app on the
# emulator pointed at it, so the login page's one-click "Démo — accès en un
# clic" buttons (DEMO_MODE=true) are there immediately — no typing
# credentials before every round of screenshots.
#
# Defaults LOCAL_HOST to 10.0.2.2, the Android emulator's fixed alias for
# the host machine — unlike android-dev's LOCAL_HOST, this one doesn't need
# to be your real LAN IP, since the emulator that's screenshotting the demo
# and the backend it's hitting are both always on this same machine. Override
# it only if you're pointing a physical device at the demo stack instead
# (needs that IP added to infra/docker-compose.yml's CORS_ORIGIN too).
# `make demo-down` when you're done — see that target's own comment.
#   make android-demo LOCAL_HOST=10.0.2.2
android-demo:
	$(MAKE) demo
	sh frontend/scripts/run-android.sh dev $(if $(LOCAL_HOST),$(LOCAL_HOST),10.0.2.2)

ios-dev:
	sh frontend/scripts/run-ios.sh dev $(LOCAL_HOST)

ios-prod:
	sh frontend/scripts/run-ios.sh prod

# Native Google Sign-In debugging (see docs/deployment.md's "Native Google
# Sign-In" section and node_modules/@capgo/capacitor-social-login/README.md's
# Android troubleshooting section): clears the device's log buffer, then
# streams only the plugin's own tags — every other tag is silenced (`*:S`).
# Run this, THEN trigger "Continuer avec Google" in the app while it's still
# running, so the failure lands in the freshly-cleared buffer. Prints the
# app's actual package name, signing SHA-1, and (masked) webClientId, which
# is what actually needs to match Google Cloud Console's Android OAuth
# client — everything the on-screen error message can't show. Needs a
# device/emulator already connected (`adb devices`).
android-logcat:
	adb logcat -c
	adb logcat GoogleProvider:* CapgoSocialLogin:* *:S
