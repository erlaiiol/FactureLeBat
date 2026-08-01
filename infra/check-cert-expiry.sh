#!/bin/sh
# Phase 21: certificate-expiry probe. Caddy renews Let's Encrypt certs on its
# own — this script exists purely to catch the case where that silently
# stops working (rate limit, DNS drift, ACME account issue) *before* the
# cert actually lapses, instead of finding out when a customer's browser
# shows a hard TLS error.
#
# Run from the repo root on the VPS, e.g. via crontab (see
# docs/deployment.md's "Certificate expiry monitoring" section):
#   0 8 * * * cd /path/to/FactureLe && sh infra/check-cert-expiry.sh >> /var/log/facturele-cert-check.log 2>&1
#
# Reads infra/.env directly rather than duplicating config: DOMAIN is the
# same value Caddy itself uses, and the alert email is sent over plain SMTP
# using the already-configured SYSTEM_SMTP_* system mailbox credentials (no
# separate provider API, no new secret to provision).
# Requires OPS_ALERT_EMAIL set in infra/.env to actually send an alert; with
# it unset, the script still logs its finding on stdout (still useful for a
# cron log) but has no way to notify anyone.
set -eu

cd "$(dirname "$0")/.."
ENV_FILE=infra/.env

if [ ! -f "$ENV_FILE" ]; then
	echo "==> $ENV_FILE not found, nothing to check" >&2
	exit 1
fi

env_var() {
	# Last matching `KEY=value` line in the env file, value only. Mirrors how
	# Docker Compose itself resolves a repeated key (infra/deploy.sh's DOMAIN
	# guard uses the same lookup).
	grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-
}

alert() {
	message=$1
	echo "==> ALERT: $message" >&2

	to=$(env_var OPS_ALERT_EMAIL)
	smtp_host=$(env_var SYSTEM_SMTP_HOST)
	smtp_port=$(env_var SYSTEM_SMTP_PORT)
	smtp_secure=$(env_var SYSTEM_SMTP_SECURE)
	smtp_user=$(env_var SYSTEM_SMTP_USER)
	smtp_password=$(env_var SYSTEM_SMTP_PASSWORD)
	from_address=$(env_var SYSTEM_MAIL_FROM_ADDRESS)
	from_name=$(env_var SYSTEM_MAIL_FROM_NAME)

	if [ -z "$to" ] || [ -z "$smtp_host" ] || [ -z "$smtp_user" ] || [ -z "$smtp_password" ] || [ -z "$from_address" ]; then
		echo "==> OPS_ALERT_EMAIL/SYSTEM_SMTP_*/SYSTEM_MAIL_FROM_ADDRESS not all set — logged above only, no email sent" >&2
		return 0
	fi

	smtp_port=${smtp_port:-587}
	if [ "$smtp_secure" = "true" ]; then
		smtp_url="smtps://$smtp_host:$smtp_port"
		ssl_flag=""
	else
		smtp_url="smtp://$smtp_host:$smtp_port"
		ssl_flag="--ssl-reqd"
	fi

	message_file=$(mktemp)
	{
		printf 'From: %s <%s>\r\n' "${from_name:-FactureLe}" "$from_address"
		printf 'To: %s\r\n' "$to"
		printf 'Subject: [FactureLe] Alerte certificat TLS\r\n'
		printf 'Content-Type: text/plain; charset=utf-8\r\n'
		printf '\r\n'
		printf '%s\r\n' "$message"
	} >"$message_file"

	curl -sS $ssl_flag --url "$smtp_url" \
		--mail-from "$from_address" --mail-rcpt "$to" \
		--user "$smtp_user:$smtp_password" \
		--upload-file "$message_file" \
		>/dev/null || echo "==> Failed to send the alert email over SMTP (see curl exit above)" >&2

	rm -f "$message_file"
}

DOMAIN=$(env_var DOMAIN)
WARN_DAYS=${CERT_EXPIRY_WARN_DAYS:-14}

if [ -z "$DOMAIN" ] || [ "$DOMAIN" = ':80' ]; then
	echo "==> DOMAIN is '$DOMAIN' (no real cert expected here), skipping"
	exit 0
fi

NOT_AFTER=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
	| openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2) || true

if [ -z "$NOT_AFTER" ]; then
	alert "Impossible de récupérer le certificat TLS de $DOMAIN (connexion refusée ou pas de certificat servi). Vérifier Caddy immédiatement."
	exit 1
fi

NOW_EPOCH=$(date +%s)
# BSD date (macOS/local testing) and GNU date (the VPS) parse -d/-j
# differently — try GNU first, fall back to BSD, so this script behaves the
# same in both places without a runtime OS check.
EXPIRY_EPOCH=$(date -d "$NOT_AFTER" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$NOT_AFTER" +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

echo "==> $DOMAIN certificate expires in $DAYS_LEFT day(s) ($NOT_AFTER)"

if [ "$DAYS_LEFT" -lt "$WARN_DAYS" ]; then
	alert "Le certificat TLS de $DOMAIN expire dans $DAYS_LEFT jour(s) ($NOT_AFTER). Le renouvellement automatique de Caddy n'a apparemment pas fonctionné — vérifier 'docker compose -f infra/docker-compose.prod.yml logs caddy'."
fi

exit 0
