#!/bin/sh
# Config/secrets audit — read-only. Checks backend/.env (native dev) and
# infra/.env (prod, see docs/deployment.md's "Secrets" section) for:
#   - required vars missing (the app already refuses to boot without these,
#     this just tells you *before* you try)
#   - known dev-only defaults still in place (infra/.env.example's
#     POSTGRES_PASSWORD, DOMAIN)
#   - secrets that look too short to be a real generated value
#   - optional feature groups that are half-configured (the feature stays
#     silently disabled until every var in the group is set — see each
#     var's comment in backend/.env.example)
#   - either .env file accidentally tracked by git despite .gitignore
#
# Never prints a secret's actual value, only whether it's set/how long it
# is. Safe to run anytime, including against a live prod infra/.env — no
# network calls, no writes, doesn't touch Docker or the running app.
#
#   sh infra/audit-config.sh
#   make audit
set -eu

cd "$(dirname "$0")/.."

WARN_COUNT=0
MISSING_COUNT=0

env_var() {
	# Last matching KEY=value line in a file (mirrors check-cert-expiry.sh's
	# env_var), value only, with surrounding quotes stripped. Empty if unset
	# or commented out.
	file=$1
	key=$2
	[ -f "$file" ] || { printf ''; return 0; }
	grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

fail() {
	echo "  [MANQUANT] $1"
	MISSING_COUNT=$((MISSING_COUNT + 1))
}

warn() {
	echo "  [ATTENTION] $1"
	WARN_COUNT=$((WARN_COUNT + 1))
}

info() {
	echo "  [INFO] $1"
}

ok() {
	echo "  [OK] $1"
}

# Rough strength heuristic for generated secrets (JWT_ACCESS_SECRET,
# APP_ENCRYPTION_KEY): both are documented as base64 of 32-48 random bytes,
# which is always well over 32 characters encoded. Never echoes the value.
check_secret_strength() {
	name=$1
	value=$2
	len=$(printf '%s' "$value" | wc -c | tr -d ' ')
	if [ "$len" -lt 32 ]; then
		warn "$name fait seulement $len caractère(s) — ressemble à une valeur de test, pas à une clé générée (voir backend/.env.example pour la commande de génération)"
	fi
}

# $1 = label, $2 = space-separated var names, $3 = env file
audit_feature_group() {
	label=$1
	vars=$2
	file=$3
	set_count=0
	total=0
	missing=""
	for v in $vars; do
		total=$((total + 1))
		val=$(env_var "$file" "$v")
		if [ -n "$val" ]; then
			set_count=$((set_count + 1))
		else
			missing="$missing $v"
		fi
	done
	if [ "$set_count" -eq 0 ]; then
		info "$label : désactivée dans $file (aucune variable configurée) — normal si tu n'utilises pas encore cette fonctionnalité"
	elif [ "$set_count" -eq "$total" ]; then
		ok "$label : configurée dans $file"
	else
		warn "$label : configuration incomplète dans $file — il manque :$missing (la fonctionnalité reste désactivée tant que ce n'est pas complet)"
	fi
}

# Phase 30: each of the 3 Stripe Price ids is independently optional (see
# StripeClientService.isTierAvailable) — unlike audit_feature_group's
# all-or-nothing group above, an unset ESSENTIEL/PRO price is a normal,
# expected state (that tier just isn't sellable yet), not a warning.
audit_stripe_tiers() {
	file=$1
	for pair in "ESSENTIEL:STRIPE_PRICE_ID_ESSENTIEL" "PRO:STRIPE_PRICE_ID_PRO" "PREMIUM:STRIPE_PRICE_ID_PREMIUM"; do
		tier=${pair%%:*}
		var=${pair#*:}
		val=$(env_var "$file" "$var")
		if [ -n "$val" ]; then
			ok "  Palier $tier ($var) : en vente"
		else
			info "  Palier $tier ($var) : non configuré — indisponible à la vente sur ce déploiement"
		fi
	done
}

check_not_tracked_by_git() {
	file=$1
	if [ -f "$file" ] && git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
		warn "$file est suivi par git malgré .gitignore — un secret a probablement fuité dans l'historique, vérifier et faire tourner (rotate) tout ce qu'il contient"
	fi
}

echo "=== Audit config/secrets — $(date '+%Y-%m-%d %H:%M') ==="

# ---------------------------------------------------------------------
echo ""
echo "-- backend/.env (dev natif) --"
BACKEND_ENV=backend/.env
if [ ! -f "$BACKEND_ENV" ]; then
	info "$BACKEND_ENV absent — ok si tu ne fais tourner le backend qu'en Docker (infra/docker-compose.yml)"
else
	check_not_tracked_by_git "$BACKEND_ENV"

	val=$(env_var "$BACKEND_ENV" DATABASE_URL)
	[ -n "$val" ] && ok "DATABASE_URL défini" || fail "DATABASE_URL absent de $BACKEND_ENV — le backend refuse de démarrer sans"

	val=$(env_var "$BACKEND_ENV" JWT_ACCESS_SECRET)
	if [ -n "$val" ]; then
		ok "JWT_ACCESS_SECRET défini"
		check_secret_strength JWT_ACCESS_SECRET "$val"
	else
		fail "JWT_ACCESS_SECRET absent de $BACKEND_ENV — le backend refuse de démarrer sans (voir backend/.env.example pour la commande de génération)"
	fi

	cors=$(env_var "$BACKEND_ENV" CORS_ORIGIN)
	case "$cors" in
	*'*'*) warn "CORS_ORIGIN contient '*' dans $BACKEND_ENV — probablement une erreur de config plutôt qu'un vrai wildcard voulu" ;;
	esac

	appkey=$(env_var "$BACKEND_ENV" APP_ENCRYPTION_KEY)
	[ -n "$appkey" ] && check_secret_strength APP_ENCRYPTION_KEY "$appkey"

	echo ""
	echo "  Fonctionnalités optionnelles :"
	audit_feature_group "Assistant sourcing (Groq)" "GROQ_API_KEY" "$BACKEND_ENV"
	audit_feature_group "Envoi de factures par email (chiffrement SMTP)" "APP_ENCRYPTION_KEY" "$BACKEND_ENV"
	audit_feature_group "Connexion Google" "GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET" "$BACKEND_ENV"
	audit_feature_group "Emails système (vérification/mot de passe oublié)" "SYSTEM_SMTP_HOST SYSTEM_SMTP_USER SYSTEM_SMTP_PASSWORD SYSTEM_MAIL_FROM_ADDRESS" "$BACKEND_ENV"
	audit_feature_group "Abonnement Stripe" "STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID_PREMIUM" "$BACKEND_ENV"
	audit_stripe_tiers "$BACKEND_ENV"
	audit_feature_group "Bootstrap admin" "ADMIN_SEED_EMAIL" "$BACKEND_ENV"
	audit_feature_group "Notifications push (Firebase)" "FIREBASE_SERVICE_ACCOUNT_JSON" "$BACKEND_ENV"
fi

# ---------------------------------------------------------------------
echo ""
echo "-- infra/.env (prod, docker compose) --"
INFRA_ENV=infra/.env
if [ ! -f "$INFRA_ENV" ]; then
	info "$INFRA_ENV absent — normal si tu n'as pas encore de déploiement prod configuré"
else
	check_not_tracked_by_git "$INFRA_ENV"

	pg_pass=$(env_var "$INFRA_ENV" POSTGRES_PASSWORD)
	if [ -z "$pg_pass" ]; then
		fail "POSTGRES_PASSWORD absent de $INFRA_ENV"
	elif [ "$pg_pass" = "facturele" ]; then
		warn "POSTGRES_PASSWORD est toujours la valeur par défaut d'infra/.env.example ('facturele') — à changer avant tout vrai déploiement (voir docs/deployment.md)"
	else
		ok "POSTGRES_PASSWORD défini et différent du défaut"
	fi

	val=$(env_var "$INFRA_ENV" JWT_ACCESS_SECRET)
	if [ -n "$val" ]; then
		ok "JWT_ACCESS_SECRET défini"
		check_secret_strength JWT_ACCESS_SECRET "$val"
	else
		fail "JWT_ACCESS_SECRET absent de $INFRA_ENV — le backend refuse de démarrer sans"
	fi

	domain=$(env_var "$INFRA_ENV" DOMAIN)
	if [ -z "$domain" ] || [ "$domain" = ':80' ]; then
		info "DOMAIN est '${domain:-<vide>}' — ok pour un smoke-test local ('make prod'), mais pas pour la vraie prod (voir docs/deployment.md)"
	else
		ok "DOMAIN configuré ($domain)"
	fi

	frontend_url=$(env_var "$INFRA_ENV" FRONTEND_URL)
	case "$frontend_url" in
	http://*)
		if [ -n "$domain" ] && [ "$domain" != ':80' ]; then
			warn "FRONTEND_URL est en http:// alors que DOMAIN ($domain) a l'air d'être un vrai domaine — les liens envoyés par email (vérification, mot de passe oublié) pointeraient vers du HTTP non chiffré"
		fi
		;;
	esac

	cors=$(env_var "$INFRA_ENV" CORS_ORIGIN)
	case "$cors" in
	*'*'*) warn "CORS_ORIGIN contient '*' dans $INFRA_ENV — probablement une erreur de config plutôt qu'un vrai wildcard voulu" ;;
	esac

	appkey=$(env_var "$INFRA_ENV" APP_ENCRYPTION_KEY)
	[ -n "$appkey" ] && check_secret_strength APP_ENCRYPTION_KEY "$appkey"

	echo ""
	echo "  Fonctionnalités optionnelles :"
	audit_feature_group "Assistant sourcing (Groq)" "GROQ_API_KEY" "$INFRA_ENV"
	audit_feature_group "Envoi de factures par email (chiffrement SMTP)" "APP_ENCRYPTION_KEY" "$INFRA_ENV"
	audit_feature_group "Connexion Google" "GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET" "$INFRA_ENV"
	audit_feature_group "Emails système (vérification/mot de passe oublié)" "SYSTEM_SMTP_HOST SYSTEM_SMTP_USER SYSTEM_SMTP_PASSWORD SYSTEM_MAIL_FROM_ADDRESS" "$INFRA_ENV"
	audit_feature_group "Abonnement Stripe" "STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID_PREMIUM" "$INFRA_ENV"
	audit_stripe_tiers "$INFRA_ENV"
	audit_feature_group "Bootstrap admin" "ADMIN_SEED_EMAIL" "$INFRA_ENV"
	audit_feature_group "Notifications push (Firebase)" "FIREBASE_SERVICE_ACCOUNT_JSON" "$INFRA_ENV"
	audit_feature_group "Alerte expiration certificat TLS" "OPS_ALERT_EMAIL" "$INFRA_ENV"
fi

echo ""
echo "=== Résumé : $MISSING_COUNT manquant(s) obligatoire(s), $WARN_COUNT avertissement(s) ==="

if [ "$MISSING_COUNT" -gt 0 ]; then
	exit 1
fi
exit 0
