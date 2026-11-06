#!/usr/bin/env bash
# Einrichtung eines frischen Hetzner-Servers (Ubuntu 24.04 / Debian 12+). Als root ausführen, idempotent.
#
#   DOMAIN=example.com ACME_EMAIL=ich@example.com ADMIN_SSH_USER=deploy REPO_URL=git@github.com:serenddsgn/serendcms.git \
#     bash server-setup.sh
#
# Voraussetzung: Du hast dich per SSH-Key als root eingeloggt und `ADMIN_SSH_USER` bekommt deinen öffentlichen Schlüssel
# (Datei ADMIN_SSH_KEY_FILE, Standard ~/.ssh/authorized_keys des aktuellen Benutzers). Danach wird SSH gehärtet.
set -Eeuo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen." >&2; exit 1; }
: "${DOMAIN:?DOMAIN fehlt}" "${ACME_EMAIL:?ACME_EMAIL fehlt}" "${REPO_URL:?REPO_URL fehlt}"
ADMIN_SSH_USER="${ADMIN_SSH_USER:-deploy}"
ADMIN_SSH_KEY_FILE="${ADMIN_SSH_KEY_FILE:-$HOME/.ssh/authorized_keys}"
NODE_MAJOR="${NODE_MAJOR:-24}"
APP_USER=serend
APP_DIR=/srv/serendportfolio
DATA_DIR=/var/lib/serendportfolio
CONF_DIR=/etc/serendportfolio
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEBIAN_FRONTEND=noninteractive
say() { echo; echo "→ $*"; }

say "Pakete"
apt-get update -y
apt-get install -y curl gnupg ca-certificates fontconfig fonts-dejavu-core lsb-release git rsync zstd age ufw fail2ban unattended-upgrades sudo postgresql-common debian-keyring debian-archive-keyring apt-transport-https openssl

say "PostgreSQL 18 (PGDG)"
if ! dpkg -s postgresql-18 >/dev/null 2>&1; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get install -y postgresql-18
fi
# Nur localhost, kein Netzwerkzugang von außen (Firewall zusätzlich)
install -d /etc/postgresql/18/main/conf.d
printf "listen_addresses = 'localhost'\n" > /etc/postgresql/18/main/conf.d/10-serend.conf
systemctl enable --now postgresql
systemctl reload postgresql

say "Node.js $NODE_MAJOR und pnpm"
if ! command -v node >/dev/null || ! node -v | grep -q "^v$NODE_MAJOR\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@9.15.9 --activate

say "Systembibliotheken für Chromium (Lighthouse-Prüfung im Worker)"
apt-get install -y libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libx11-6 libxext6 fonts-liberation

say "Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
install -d -o caddy -g caddy /var/log/caddy

say "Benutzer, Verzeichnisse"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$DATA_DIR/home" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR" "$DATA_DIR"/{media,releases,cache,cache-preview,backups,admin,maintenance,browsers,home}
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
# Caddy muss die Releases und das Admin-Verzeichnis lesen können
usermod -aG "$APP_USER" caddy
chmod 750 "$DATA_DIR"; chmod g+rx "$DATA_DIR"/releases "$DATA_DIR"/admin "$DATA_DIR"/maintenance

# Datenbank: Rolle = Dienstbenutzer, Anmeldung per Peer über den Unix-Socket (kein Datenbank-Passwort)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$APP_USER'" | grep -q 1 || sudo -u postgres createuser "$APP_USER"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='serendportfolio'" | grep -q 1 || sudo -u postgres createdb --owner="$APP_USER" serendportfolio

say "Konfiguration unter $CONF_DIR (Rechte 600, Secrets zufällig erzeugt)"
install -d -m 750 "$CONF_DIR"
gen() { openssl rand -base64 48 | tr -d '\n'; }
if [ ! -f "$CONF_DIR/serendportfolio.env" ]; then
  sed -e "s#https://admin.example.com#https://admin.$DOMAIN#" -e "s#https://preview.example.com#https://preview.$DOMAIN#" \
      -e "s#^DOMAIN=example.com#DOMAIN=$DOMAIN#" -e "s#^ACME_EMAIL=admin@example.com#ACME_EMAIL=$ACME_EMAIL#" \
      -e "s#https://example.com#https://$DOMAIN#" -e "s#noreply@example.com#noreply@$DOMAIN#" "$SRC/env.production.example" > "$CONF_DIR/serendportfolio.env"
  for k in SESSION_SECRET BUILD_TOKEN PREVIEW_SIGNING_KEY; do
    sed -i "s#^$k=__GENERATE__#$k=$(gen)#" "$CONF_DIR/serendportfolio.env"
  done
  chmod 600 "$CONF_DIR/serendportfolio.env"; chown root:root "$CONF_DIR/serendportfolio.env"
  echo "  Neu angelegt. SMTP_* und CONTACT_NOTIFY_TO bitte noch eintragen: $CONF_DIR/serendportfolio.env"
else
  echo "  Besteht bereits, nichts überschrieben."
fi
if [ ! -f "$CONF_DIR/preview.env" ]; then
  sed -e "s#https://example.com#https://$DOMAIN#" "$SRC/preview.env.example" > "$CONF_DIR/preview.env"
  chmod 600 "$CONF_DIR/preview.env"
fi
if [ ! -f "$CONF_DIR/backup.env" ]; then cp "$SRC/backup.env.example" "$CONF_DIR/backup.env"; chmod 600 "$CONF_DIR/backup.env"; fi
# Caddy bekommt nur Domain und E-Mail
install -d /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=DOMAIN=%s\nEnvironment=ACME_EMAIL=%s\n' "$DOMAIN" "$ACME_EMAIL" > /etc/systemd/system/caddy.service.d/override.conf

say "Firewall: nur 22, 80, 443"
ufw --force reset >/dev/null
ufw default deny incoming; ufw default allow outgoing
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable

say "Admin-Benutzer '$ADMIN_SSH_USER' für SSH"
id "$ADMIN_SSH_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$ADMIN_SSH_USER"
install -d -m 700 -o "$ADMIN_SSH_USER" -g "$ADMIN_SSH_USER" "/home/$ADMIN_SSH_USER/.ssh"
[ -s "$ADMIN_SSH_KEY_FILE" ] || { echo "Kein SSH-Schlüssel in $ADMIN_SSH_KEY_FILE gefunden. Abbruch, bevor SSH gehärtet wird (sonst sperrst du dich aus)." >&2; exit 1; }
cat "$ADMIN_SSH_KEY_FILE" >> "/home/$ADMIN_SSH_USER/.ssh/authorized_keys"
sort -u "/home/$ADMIN_SSH_USER/.ssh/authorized_keys" -o "/home/$ADMIN_SSH_USER/.ssh/authorized_keys"
chown "$ADMIN_SSH_USER:$ADMIN_SSH_USER" "/home/$ADMIN_SSH_USER/.ssh/authorized_keys"; chmod 600 "/home/$ADMIN_SSH_USER/.ssh/authorized_keys"
# deploy darf genau das Deploy-Skript als serend ausführen
printf '%s ALL=(%s) NOPASSWD: ALL\n' "$ADMIN_SSH_USER" "$APP_USER" > /etc/sudoers.d/serend-deploy-user
install -m 440 "$SRC/sudoers.d/serend" /etc/sudoers.d/serend
visudo -cf /etc/sudoers.d/serend >/dev/null && visudo -cf /etc/sudoers.d/serend-deploy-user >/dev/null
chmod 440 /etc/sudoers.d/serend-deploy-user

say "SSH härten: nur Schlüssel, kein Root-Login, kein Passwort"
cat > /etc/ssh/sshd_config.d/10-serend-hardening.conf <<'SSHD'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
SSHD
sshd -t && systemctl reload ssh || systemctl reload sshd
systemctl enable --now fail2ban

say "Deploy-Key (nur Lesezugriff) für GitHub"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR/home/.ssh"
if [ ! -f "$DATA_DIR/home/.ssh/deploy_ed25519" ]; then
  sudo -u "$APP_USER" ssh-keygen -t ed25519 -N "" -C "serendportfolio-deploy@$(hostname)" -f "$DATA_DIR/home/.ssh/deploy_ed25519" >/dev/null
fi
printf 'Host github.com\n  IdentityFile %s/home/.ssh/deploy_ed25519\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' "$DATA_DIR" > "$DATA_DIR/home/.ssh/config"
chown "$APP_USER:$APP_USER" "$DATA_DIR/home/.ssh/config"; chmod 600 "$DATA_DIR/home/.ssh/config"
echo
echo "  ► Diesen öffentlichen Schlüssel in GitHub als Deploy-Key (nur Lesen!) eintragen:"
echo "    Repository → Settings → Deploy keys → Add deploy key (Write access NICHT ankreuzen)"
cat "$DATA_DIR/home/.ssh/deploy_ed25519.pub"
if [ ! -d "$APP_DIR/.git" ]; then
  echo
  read -r -p "Deploy-Key eingetragen? Enter zum Klonen (Strg+C zum Abbrechen und später erneut ausführen) " _
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi

say "systemd-Units und Caddy-Konfiguration"
install -m 644 "$SRC"/systemd/*.service "$SRC"/systemd/*.timer /etc/systemd/system/
install -m 644 "$SRC/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable serend-api serend-worker serend-preview serend-backup.timer
systemctl enable --now caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || echo "  Hinweis: Caddy-Validierung schlug fehl (fehlen die Release-Dateien noch? das ist vor dem ersten Build normal)."
# `caddy validate` läuft als root und legt dabei die Logdateien an: sie müssen dem Dienstbenutzer gehören, sonst startet Caddy nicht
chown -R caddy:caddy /var/log/caddy
systemctl restart caddy || true

cat <<DONE

✓ Server vorbereitet.

Nächste Schritte (siehe deploy/README.md):
  1. DNS: A/AAAA für $DOMAIN, www.$DOMAIN, admin.$DOMAIN, preview.$DOMAIN auf diesen Server.
  2. $CONF_DIR/serendportfolio.env ergänzen (SMTP, CONTACT_NOTIFY_TO).
  3. Erstes Deployment als $ADMIN_SSH_USER:   sudo -u $APP_USER -H bash -lc 'cd $APP_DIR && pnpm run deploy main'
  4. Ersten Admin anlegen:                   sudo -u $APP_USER -H bash -lc 'cd $APP_DIR && DATABASE_URL=postgres:///serendportfolio?host=/var/run/postgresql pnpm --filter @serend/api create-admin --email du@example.com --name "Dein Name"'
  4b. Startinhalte (sonst schlägt der erste Seiten-Build fehl):   sudo -u $APP_USER -H bash -lc 'cd $APP_DIR && DATABASE_URL=postgres:///serendportfolio?host=/var/run/postgresql STORAGE_DIR=$DATA_DIR/media pnpm --filter @serend/api seed-content --admin du@example.com'
  5. Backups einrichten ($CONF_DIR/backup.env, age-Schlüsselpaar, Storage-Box-Zugang), dann: systemctl start serend-backup
DONE
