.PHONY: dev prod down migrate logs deploy backup logs-files logs-errors logs-files-prod logs-errors-prod mobile-build ios android

dev:
	docker compose -f infra/docker-compose.yml up --build

prod:
	docker compose -f infra/docker-compose.prod.yml up --build -d

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

# Real-server commands (see docs/deployment.md) — run these against a repo
# checkout already running `make prod`, e.g. on the OVH VPS.
deploy:
	sh infra/deploy.sh

backup:
	sh infra/backup.sh

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
