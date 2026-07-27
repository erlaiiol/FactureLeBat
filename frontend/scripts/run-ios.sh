#!/bin/sh
# Builds the app in Release configuration and installs+launches it on a
# booted iOS Simulator — no Xcode UI needed (unlike `make ios`, which opens
# Xcode; keep using that for a physical device or when you actually need
# the debugger attached).
#
# Needs a full Xcode install active, not just the Command Line Tools:
# `xcode-select -p` must point at an Xcode.app. Simulator builds don't need
# a real Apple signing identity — CODE_SIGNING_ALLOWED=NO below is standard
# for simulator-only builds, no distribution credentials involved.
#
# dev mode temporarily enables a cleartext-HTTP ATS exception for your LAN
# IP (Info.plist, normally shipped commented-out — see the warning inline
# in that file) so the simulator can reach a backend running on your own
# machine, then reverts the file on exit no matter how the script ends.
# Requires a clean git tree for that file going in, so a failed/interrupted
# run can never leave your working copy stuck mid-patch.
#
#   sh scripts/run-ios.sh dev [local-host-ip]   # backend on your machine
#   sh scripts/run-ios.sh prod                  # real API domain
set -eu

MODE=${1:-}
if [ "$MODE" != "dev" ] && [ "$MODE" != "prod" ]; then
	echo "Usage: $0 dev [local-host-ip] | prod" >&2
	exit 1
fi

cd "$(dirname "$0")/.." # frontend/

case "$(xcode-select -p 2>/dev/null || true)" in
*CommandLineTools* | "")
	echo "==> Xcode complet requis (pas juste les Command Line Tools). Installe Xcode depuis l'App Store puis : sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
	exit 1
	;;
esac

PLIST=ios/App/App/Info.plist

if [ "$MODE" = "dev" ]; then
	LOCAL_HOST=${2:-$(ipconfig getifaddr en0 2>/dev/null || true)}
	if [ -z "$LOCAL_HOST" ]; then
		echo "==> Impossible de détecter ton IP locale automatiquement (en0). Passe-la explicitement : sh scripts/run-ios.sh dev 192.168.1.23" >&2
		exit 1
	fi

	if [ -n "$(git status --porcelain -- "$PLIST" 2>/dev/null)" ]; then
		echo "==> $PLIST a des changements non commités — commit/stash d'abord (ce script le modifie temporairement puis le restaure via 'git checkout')." >&2
		exit 1
	fi

	echo "==> Build dev — API sur http://$LOCAL_HOST:3000 (backend/.env doit avoir CORS_ORIGIN incluant cette IP)"

	restore_plist() {
		git checkout -- "$PLIST"
	}
	trap restore_plist EXIT

	# Uncomment the dev-only ATS exception and fill in the LAN IP — strips
	# only the two standalone `<!--`/`-->` marker lines wrapping the
	# NSAppTransportSecurity dict, not the explanatory comment above them
	# (whose own <!-- / --> share lines with actual sentence text, so they
	# never match "line is exactly <!-- (or -->) after its leading tab").
	awk '{
		line = $0
		gsub(/^\t/, "", line)
		if (line == "<!--" || line == "-->") next
		print
	}' "$PLIST" >"$PLIST.tmp"
	mv "$PLIST.tmp" "$PLIST"
	sed -i '' "s#REPLACE_WITH_CAPACITOR_LOCAL_HOST#$LOCAL_HOST#" "$PLIST"

	npx ng build --configuration production
	CAPACITOR_LOCAL_HOST="$LOCAL_HOST" npx cap sync ios
else
	echo "==> Build prod — API sur https://facturele.net (voir capacitor.config.ts)"
	npx ng build --configuration production
	npx cap sync ios
fi

DEVICE_UDID=$(xcrun simctl list devices booted | grep -Eo '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -n1 || true)
if [ -z "$DEVICE_UDID" ]; then
	DEVICE_UDID=$(xcrun simctl list devices available | grep -m1 'iPhone' | grep -Eo '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' || true)
	if [ -z "$DEVICE_UDID" ]; then
		echo "==> Aucun simulateur iPhone disponible. Crée-en un dans Xcode > Window > Devices and Simulators." >&2
		exit 1
	fi
	echo "==> Aucun simulateur démarré, démarrage de $DEVICE_UDID"
	xcrun simctl boot "$DEVICE_UDID"
	open -a Simulator
fi

echo "==> Compilation (configuration Release, simulateur)"
BUILD_DIR=$(mktemp -d)
xcodebuild \
	-project ios/App/App.xcodeproj \
	-scheme App \
	-configuration Release \
	-sdk iphonesimulator \
	-derivedDataPath "$BUILD_DIR" \
	-destination "id=$DEVICE_UDID" \
	CODE_SIGNING_ALLOWED=NO \
	build

APP_PATH=$(find "$BUILD_DIR/Build/Products" -maxdepth 2 -name "App.app" | head -n1)
if [ -z "$APP_PATH" ]; then
	echo "==> App.app introuvable après le build." >&2
	rm -rf "$BUILD_DIR"
	exit 1
fi

echo "==> Installation sur $DEVICE_UDID"
xcrun simctl install "$DEVICE_UDID" "$APP_PATH"

echo "==> Lancement"
xcrun simctl launch "$DEVICE_UDID" fr.facturele.app

rm -rf "$BUILD_DIR"

echo "==> fr.facturele.app installé et lancé sur le simulateur"
