#!/bin/sh
# Builds the app in release configuration and installs+launches it on a
# running Android emulator — no Android Studio UI needed (unlike `make
# android`, which opens the IDE; keep using that for a physical device or
# when you actually need the debugger attached).
#
# "release" here means the release *build type* (minify/proguard rules
# apply, android:debuggable=false) signed with the debug keystore Gradle
# auto-generates (see ../android/app/build.gradle) — installable on an
# emulator with zero signing setup, but NOT a store-distribution artifact.
#
# dev mode temporarily enables a cleartext-HTTP exception for your LAN IP
# (AndroidManifest.xml + res/xml/network_security_config.xml, both normally
# inert/commented — see the warnings inline in those files) so the emulator
# can reach a backend running on your own machine, then reverts both files
# on exit no matter how the script ends. Requires a clean git tree for
# those two files going in, so a failed/interrupted run can never leave
# your working copy stuck mid-patch.
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

if [ "$MODE" = "dev" ]; then
	LOCAL_HOST=${2:-$(ipconfig getifaddr en0 2>/dev/null || true)}
	if [ -z "$LOCAL_HOST" ]; then
		echo "==> Impossible de détecter ton IP locale automatiquement (en0). Passe-la explicitement : sh scripts/run-android.sh dev 192.168.1.23" >&2
		exit 1
	fi

	if [ -n "$(git status --porcelain -- "$MANIFEST" "$NETSEC" 2>/dev/null)" ]; then
		echo "==> $MANIFEST ou $NETSEC a des changements non commités — commit/stash d'abord (ce script les modifie temporairement puis les restaure via 'git checkout')." >&2
		exit 1
	fi

	echo "==> Build dev — API sur http://$LOCAL_HOST:3000 (backend/.env doit avoir CORS_ORIGIN incluant cette IP)"

	restore_manifest_files() {
		git checkout -- "$MANIFEST" "$NETSEC"
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

	npx ng build --configuration production
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
