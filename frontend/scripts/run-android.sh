#!/bin/sh
# Builds the app in release configuration and installs+launches it on a
# running Android emulator — no Android Studio UI needed (unlike `make
# android`, which opens the IDE; keep using that for a physical device or
# when you actually need the debugger attached).
#
# "release" here means the release *build type* (minify/proguard rules
# apply, android:debuggable=false), signed with the real release key via
# ../android/keystore.properties (gitignored — fill in storePassword/
# keyPassword there once; see ../android/app/build.gradle). Installing over
# a copy previously signed with the old debug keystore fails with an
# INSTALL_FAILED_UPDATE_INCOMPATIBLE signature mismatch — uninstall first.
#
# dev mode temporarily enables a cleartext-HTTP exception for your LAN IP
# (AndroidManifest.xml + res/xml/network_security_config.xml, both normally
# inert/commented — see the warnings inline in those files), points the
# built app's apiBaseUrl at that same LAN IP on port 3000 and reflects
# whether google-services.json exists (src/environments/environment.capacitor-dev.ts,
# ships with inert placeholders — see the comments in that file for both:
# why a relative apiBaseUrl, as used in prod, resolves to the wrong port
# here, and why calling PushNotifications.register() without a real Firebase
# config crashes the whole app natively), and relaxes the app's CSP
# connect-src to allow that same origin (src/index.capacitor-dev.html — the
# WebView's own origin and the local API are NOT same-origin here, unlike
# real prod/store builds, which is what index.html's stricter CSP assumes),
# then reverts all four files on exit no matter how the script ends. Requires
# a clean git tree for those four files going in, so a failed/interrupted run
# can never leave your working copy stuck mid-patch.
#
#   sh scripts/run-android.sh dev [local-host-ip]   # backend on your machine
#   sh scripts/run-android.sh prod                  # real API domain
set -eu

MODE=${1:-}
if [ "$MODE" != "dev" ] && [ "$MODE" != "prod" ]; then
	echo "Usage: $0 dev [local-host-ip] | prod" >&2
	exit 1
fi

cd "$(dirname "$0")/.." # frontend/

command -v adb >/dev/null 2>&1 || {
	echo "==> adb introuvable dans le PATH — installe le Android SDK (Android Studio > SDK Manager > SDK Tools > Android SDK Platform-Tools) et ajoute platform-tools au PATH." >&2
	exit 1
}

MANIFEST=android/app/src/main/AndroidManifest.xml
NETSEC=android/app/src/main/res/xml/network_security_config.xml
ENVFILE=src/environments/environment.capacitor-dev.ts
INDEXFILE=src/index.capacitor-dev.html

if [ "$MODE" = "dev" ]; then
	LOCAL_HOST=${2:-$(ipconfig getifaddr en0 2>/dev/null || true)}
	if [ -z "$LOCAL_HOST" ]; then
		echo "==> Impossible de détecter ton IP locale automatiquement (en0). Passe-la explicitement : sh scripts/run-android.sh dev 192.168.1.23" >&2
		exit 1
	fi

	if [ -n "$(git status --porcelain -- "$MANIFEST" "$NETSEC" "$ENVFILE" "$INDEXFILE" 2>/dev/null)" ]; then
		echo "==> $MANIFEST, $NETSEC, $ENVFILE ou $INDEXFILE a des changements non commités — commit/stash d'abord (ce script les modifie temporairement puis les restaure via 'git checkout')." >&2
		exit 1
	fi

	echo "==> Build dev — API sur http://$LOCAL_HOST:3000 (backend/.env doit avoir CORS_ORIGIN incluant cette IP)"

	restore_manifest_files() {
		git checkout -- "$MANIFEST" "$NETSEC" "$ENVFILE" "$INDEXFILE"
	}
	trap restore_manifest_files EXIT

	# Uncomment the dev-only cleartext exception and fill in the LAN IP —
	# both files ship inert/commented, see the warnings inside them.
	# Anchored to the bare `    <application` tag line specifically (not
	# `s#<application#...#`, which also matches the literal string
	# "<application>" inside this same file's explanatory comment above it).
	sed -i '' 's#^    <application$#    <application\
        android:networkSecurityConfig="@xml/network_security_config"#' "$MANIFEST"
	sed -i '' "s#REPLACE_WITH_CAPACITOR_LOCAL_HOST#$LOCAL_HOST#" "$NETSEC"
	sed -i '' "s#REPLACE_WITH_CAPACITOR_LOCAL_HOST#$LOCAL_HOST#" "$ENVFILE"
	# g flag: index.capacitor-dev.html's CSP meta tag has the placeholder
	# twice on the same line (img-src and connect-src both carve out the
	# local API origin) — without it, sed only patches the first occurrence
	# and ships a broken, unmatchable literal string in the CSP's img-src.
	sed -i '' "s#REPLACE_WITH_CAPACITOR_LOCAL_HOST#$LOCAL_HOST#g" "$INDEXFILE"
	if [ -f android/app/google-services.json ]; then
		sed -i '' 's#pushNotificationsAvailable: false#pushNotificationsAvailable: true#' "$ENVFILE"
	fi

	npx ng build --configuration production,capacitor-dev
	# The application builder keeps the source index filename as-is in dist/
	# (unlike the old webpack builder, which always emitted index.html) —
	# Capacitor's webDir requires literally index.html, so rename it post-build.
	mv dist/frontend/browser/index.capacitor-dev.html dist/frontend/browser/index.html
	CAPACITOR_LOCAL_HOST="$LOCAL_HOST" npx cap sync android
else
	echo "==> Build prod — API sur https://facturele.net (voir capacitor.config.ts)"
	npx ng build --configuration production
	npx cap sync android
fi

echo "==> Compilation de l'APK release"
(cd android && ./gradlew assembleRelease)

APK=android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || {
	echo "==> APK introuvable à $APK — le build Gradle a dû échouer." >&2
	exit 1
}

DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
if [ -z "$DEVICE" ]; then
	echo "==> Aucun émulateur/appareil Android détecté. Démarre un émulateur (Android Studio > Device Manager, ou 'emulator -avd <nom>') puis relance." >&2
	exit 1
fi

echo "==> Installation sur $DEVICE"
adb -s "$DEVICE" install -r "$APK"

echo "==> Lancement"
adb -s "$DEVICE" shell monkey -p fr.facturele.app -c android.intent.category.LAUNCHER 1 >/dev/null

echo "==> fr.facturele.app installé et lancé sur $DEVICE"
