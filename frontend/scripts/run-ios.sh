#!/bin/sh
# Builds the app in Release configuration and installs+launches it on a
# booted iOS Simulator — no Xcode UI needed (unlike `make ios`, which opens
# Xcode; keep using that for a physical device or when you actually need
# the debugger attached).
#
# Needs a full Xcode install active, not just the Command Line Tools:
# `xcode-select -p` must point at an Xcode.app. Simulator builds don't need
# a real Apple signing identity, but they DO need to actually go through
# codesign — entitlements (com.apple.developer.applesignin included) are
# embedded by the codesign step itself, and Sign In with Apple's
# ASAuthorizationController rejects with the opaque "error 1000" against a
# fully unsigned binary. Ad-hoc signing (CODE_SIGN_IDENTITY=-) below embeds
# them without needing any real distribution credentials.
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

	echo "==> Build dev — API sur http://$LOCAL_HOST:3000 (CORS_ORIGIN du backend doit inclure capacitor://$LOCAL_HOST — PAS http://$LOCAL_HOST:3000, ce n'est jamais l'Origin qu'envoie la WebView iOS; infra/docker-compose.yml inclut déjà capacitor://127.0.0.1 pour le Simulateur par défaut)"

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

	# index.html's CSP (see that file's own comment) only allow-lists
	# 'self' + https://facturele.net — in prod that covers everything,
	# since resolveApiBaseUrl (environment.prod.ts) calls the API by that
	# exact absolute URL. In dev mode it doesn't: resolveApiBaseUrl instead
	# builds an absolute http://$LOCAL_HOST:3000 URL (this script's own
	# "API sur http://$LOCAL_HOST:3000" line above), a different origin
	# 'self' can't cover — every fetch/XHR to it gets silently blocked
	# ("Refused to connect to ... it does not appear in the connect-src
	# directive"). img-src needs the same carve-out: CompanyService.logoUrl/
	# InvoiceService.signatureUrl bind an <img [src]> straight to
	# environment.apiBaseUrl. Same fix run-android.sh already has via its
	# own index.capacitor-dev.html — done here as a direct sed on the built
	# output instead, since iOS (unlike Android) doesn't need a whole
	# environment-file swap (resolveApiBaseUrl already computes the right
	# dev URL on its own), and patching dist/ needs no restore-on-exit like
	# Info.plist above (dist/ is a regenerated build artifact, not tracked).
	sed -i '' "s#connect-src 'self' https://facturele.net blob:#connect-src 'self' https://facturele.net blob: http://$LOCAL_HOST:3000#; s#img-src 'self' data:#img-src 'self' data: http://$LOCAL_HOST:3000#" dist/frontend/browser/index.html

	CAPACITOR_LOCAL_HOST="$LOCAL_HOST" npx cap sync ios
else
	echo "==> Build prod — API sur https://facturele.net (voir capacitor.config.ts)"
	npx ng build --configuration production
	npx cap sync ios
fi

# DEVICE (env var, e.g. `DEVICE="iPhone 17 Pro Max" make ios-prod`) picks a
# specific simulator by exact name — needed for App Store screenshots, which
# must come from a specific device size/class. Without it, falls back to the
# old behavior: whatever's already booted (any model), else the first
# available iPhone in simctl's own listing order — neither lets you target a
# particular model once a different one is already booted.
if [ -n "${DEVICE:-}" ]; then
	DEVICE_UDID=$(xcrun simctl list devices available | grep -F "$DEVICE (" | grep -Eo '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -n1 || true)
	if [ -z "$DEVICE_UDID" ]; then
		echo "==> Aucun simulateur nommé exactement \"$DEVICE\" (Xcode > Window > Devices and Simulators pour en créer un, ou choisis parmi ceux-ci) :" >&2
		xcrun simctl list devices available | grep -E '^\s+iPhone' >&2
		exit 1
	fi
	if ! xcrun simctl list devices booted | grep -q "$DEVICE_UDID"; then
		echo "==> Démarrage de \"$DEVICE\" ($DEVICE_UDID)"
		xcrun simctl boot "$DEVICE_UDID"
		open -a Simulator
	fi
else
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
	CODE_SIGN_IDENTITY=- \
	CODE_SIGNING_REQUIRED=NO \
	CODE_SIGNING_ALLOWED=YES \
	build

APP_PATH=$(find "$BUILD_DIR/Build/Products" -maxdepth 2 -name "*.app" | head -n1)
if [ -z "$APP_PATH" ]; then
	echo "==> Le .app est introuvable après le build." >&2
	rm -rf "$BUILD_DIR"
	exit 1
fi

echo "==> Installation sur $DEVICE_UDID"
xcrun simctl install "$DEVICE_UDID" "$APP_PATH"

echo "==> Lancement"
xcrun simctl launch "$DEVICE_UDID" fr.facturele.app

rm -rf "$BUILD_DIR"

echo "==> fr.facturele.app installé et lancé sur le simulateur"
