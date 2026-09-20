#!/usr/bin/env bash
# ==============================================================================
# install.sh — DDO News Portal Linux telepítő
#
# Használat (root vagy sudo szükséges):
#   sudo bash install.sh [appnév]
#
# Példák:
#   sudo bash install.sh                  # app neve: ddo-news-portal
#   sudo bash install.sh moddinglife      # app neve: moddinglife
#
# A script:
#   1. Létrehozza a /var/node/<appnév>/ könyvtárat
#   2. Bemásolja a binaryt, templates/, static/ mappákat
#   3. Ha még nincs .env, bekéri a szükséges adatokat és létrehozza
#      Ha már létezik .env, ellenőrzi a kötelező mezőket és bekéri a hiányzókat
#   4. Létrehozza / frissíti a systemd service fájlt
#   5. Ha a service már futott, leállítja, frissíti, újraindítja
#   6. Engedélyezi az automatikus indítást (systemctl enable)
#   7. Ha még nincs nginx konfig, létrehozza (HTTP, certbot-kompatibilis)
#   8. Kiírja a következő lépéseket (certbot)
# ==============================================================================
set -euo pipefail

# --- Paraméterek --------------------------------------------------------------
APP_NAME="${1:-ddo-news-portal}"
INSTALL_DIR="/var/node/${APP_NAME}"
SERVICE_NAME="${APP_NAME}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_USER="www-data"
RUN_GROUP="www-data"

# --- Ellenőrzések -------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    echo "Hiba: a telepítőt root jogokkal kell futtatni." >&2
    echo "Használat: sudo bash install.sh [appnév]" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for f in server templates static .env.example; do
    if [[ ! -e "$SCRIPT_DIR/$f" ]]; then
        echo "Hiba: '$f' nem található a script könyvtárában ($SCRIPT_DIR)." >&2
        exit 1
    fi
done

# ==============================================================================
# .env kezelés: ellenőrzés + interaktív bekérés
# ==============================================================================

ENV_FILE="$INSTALL_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# Helper: értéket olvas ki egy .env fájlból
env_get() {
    local file="$1" key="$2"
    grep -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true
}

# Helper: sort frissít vagy hozzáad egy .env fájlban
env_set() {
    local file="$1" key="$2" value="$3"
    if grep -qE "^${key}=" "$file" 2>/dev/null; then
        awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} 1' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >> "$file"
    fi
}

# Helper: bekér egy értéket (opcionálisan rejtve), üres nem fogadható el
prompt_required() {
    local prompt="$1"
    local secret="${2:-false}"
    local value=""
    while [[ -z "$value" ]]; do
        if $secret; then
            read -rsp "  ${prompt}: " value
            echo ""
        else
            read -rp  "  ${prompt}: " value
        fi
        if [[ -z "$value" ]]; then
            echo "  Ez a mező kötelező, nem lehet üres."
        fi
    done
    echo "$value"
}

# Helper: bekér egy értéket alapértelmezett értékkel
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local value=""
    read -rp "  ${prompt} [${default}]: " value
    echo "${value:-$default}"
}

# Kötelező .env mezők listája (kulcs|leírás|titkos)
declare -a REQUIRED_FIELDS=(
    "SITE_URL|A webhely teljes URL-je (pl. https://moddinglife.hu)|false"
    "PORT|Backend HTTP port|false"
    "MONGODB_URI|MongoDB kapcsolati URI|false"
    "ADMIN_EMAIL|Admin bejelentkezési e-mail|false"
    "ADMIN_PASSWORD_HASH|Admin jelszó bcrypt hash-e|true"
    "API_KEY|API kulcs|true"
)

# Könyvtár létrehozása az ellenőrzés előtt (ha még nem létezik)
mkdir -p "$INSTALL_DIR"

# Ha nincs .env a célkönyvtárban, másolja az example-t alapnak
if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    NEW_ENV=true
else
    NEW_ENV=false
fi

# Hiányzó / üres mezők ellenőrzése és bekérése
NEEDS_INPUT=false
for field_def in "${REQUIRED_FIELDS[@]}"; do
    KEY="${field_def%%|*}"
    rest="${field_def#*|}"
    DESC="${rest%%|*}"
    SECRET="${rest##*|}"
    VAL="$(env_get "$ENV_FILE" "$KEY")"
    if [[ -z "$VAL" ]]; then
        NEEDS_INPUT=true
        break
    fi
done

if $NEEDS_INPUT; then
    echo ""
    echo "--- .env konfiguráció ---"
    if $NEW_ENV; then
        echo "Új telepítés: add meg a szükséges értékeket."
    else
        echo "A meglévő .env néhány kötelező mezője hiányzik. Add meg az értékeket."
    fi
    echo ""

    for field_def in "${REQUIRED_FIELDS[@]}"; do
        KEY="${field_def%%|*}"
        rest="${field_def#*|}"
        DESC="${rest%%|*}"
        SECRET="${rest##*|}"
        VAL="$(env_get "$ENV_FILE" "$KEY")"

        if [[ -z "$VAL" ]]; then
            # Speciális default értékek
            if [[ "$KEY" == "PORT" ]]; then
                VAL="$(prompt_with_default "$DESC" "8080")"
            else
                VAL="$(prompt_required "$DESC" "$SECRET")"
            fi
            env_set "$ENV_FILE" "$KEY" "$VAL"
        else
            echo "  $KEY: [már beállítva]"
        fi
    done
    echo ""
fi

# PORT és SITE_URL kiolvasása a továbbiakhoz
APP_PORT="$(env_get "$ENV_FILE" "PORT")"
APP_PORT="${APP_PORT:-8080}"

SITE_URL_VAL="$(env_get "$ENV_FILE" "SITE_URL")"
DOMAIN=""
BARE_DOMAIN=""
WWW_DOMAIN=""
if [[ -n "$SITE_URL_VAL" ]]; then
    DOMAIN="$(echo "$SITE_URL_VAL" | sed -E 's|https?://||' | sed -E 's|/.*||' | sed -E 's|:[0-9]+||')"
    # Szétválasztás: bare (moddinglife.hu) és www (www.moddinglife.hu)
    if [[ "$DOMAIN" == www.* ]]; then
        BARE_DOMAIN="${DOMAIN#www.}"
        WWW_DOMAIN="$DOMAIN"
    else
        BARE_DOMAIN="$DOMAIN"
        WWW_DOMAIN="www.${DOMAIN}"
    fi
fi

# ==============================================================================
echo "=== DDO News Portal — Linux telepítő ==="
echo "App neve    : $APP_NAME"
echo "Célkönyvtár : $INSTALL_DIR"
echo "Service     : $SERVICE_FILE"
echo "Backend port: $APP_PORT"
if [[ -n "$DOMAIN" ]]; then
    echo "Domain      : $DOMAIN"
fi
echo ""

# --- Service leállítása (ha futott) ------------------------------------------
WAS_RUNNING=false
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Service leállítása: $SERVICE_NAME..."
    systemctl stop "$SERVICE_NAME"
    WAS_RUNNING=true
fi

# --- Fájlok másolása ----------------------------------------------------------
echo "Fájlok másolása -> $INSTALL_DIR ..."

cp -f "$SCRIPT_DIR/server" "$INSTALL_DIR/server"
if [[ ! -x "$INSTALL_DIR/server" ]]; then
    echo "Futtatási jog beállítása: $INSTALL_DIR/server ..."
    chmod +x "$INSTALL_DIR/server"
fi

rm -rf "$INSTALL_DIR/templates"
cp -r  "$SCRIPT_DIR/templates" "$INSTALL_DIR/templates"

rm -rf "$INSTALL_DIR/static"
cp -r  "$SCRIPT_DIR/static" "$INSTALL_DIR/static"

# Tulajdonos beállítása
chown -R "${RUN_USER}:${RUN_GROUP}" "$INSTALL_DIR"

# --- Systemd service fájl -----------------------------------------------------
echo "Systemd service írása: $SERVICE_FILE ..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=${APP_NAME} Go Web Server
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/server
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
StartLimitIntervalSec=60
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
EOF

# --- Systemd újratöltés + engedélyezés ----------------------------------------
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# --- Service indítása ---------------------------------------------------------
echo "Service indítása: $SERVICE_NAME ..."
systemctl start "$SERVICE_NAME"

# --- Webszerver detektálás + nginx konfig ------------------------------------
NGINX_INSTALLED=false
NGINX_CONF_CREATED=false
NGINX_CONF_AVAILABLE=""
OTHER_WEBSERVER=""

# Megvizsgáljuk, milyen webszerver fut / telepített
if command -v nginx &>/dev/null; then
    NGINX_INSTALLED=true
    NGINX_CONF_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
    NGINX_CONF_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
elif command -v apache2 &>/dev/null || command -v httpd &>/dev/null; then
    OTHER_WEBSERVER="Apache"
elif command -v caddy &>/dev/null; then
    OTHER_WEBSERVER="Caddy"
elif command -v lighttpd &>/dev/null; then
    OTHER_WEBSERVER="Lighttpd"
fi

if $NGINX_INSTALLED && [[ -n "$DOMAIN" ]]; then
    if [[ -f "$NGINX_CONF_AVAILABLE" ]]; then
        echo ""
        echo "Nginx konfig már létezik, nem módosítva: $NGINX_CONF_AVAILABLE"
    else
        echo ""
        echo "Nginx konfig létrehozása: $NGINX_CONF_AVAILABLE ..."
        cat > "$NGINX_CONF_AVAILABLE" <<NGINXEOF
# Upstream Go alkalmazás
upstream ${APP_NAME}_backend {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

# HTTP — certbot majd átalakítja HTTPS-re
server {
    listen 80;
    listen [::]:80;
    server_name ${BARE_DOMAIN} ${WWW_DOMAIN};

    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log  /var/log/nginx/${DOMAIN}.error.log;

    client_max_body_size 50M;

    location / {
        proxy_pass http://${APP_NAME}_backend;

        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
}
NGINXEOF

        # Symlink a sites-enabled-be
        if [[ ! -L "$NGINX_CONF_ENABLED" ]]; then
            ln -s "$NGINX_CONF_AVAILABLE" "$NGINX_CONF_ENABLED"
        fi

        # Konfig ellenőrzés + reload
        if nginx -t 2>/dev/null; then
            systemctl reload nginx
            echo "Nginx konfig betöltve."
            NGINX_CONF_CREATED=true
        else
            echo "FIGYELEM: nginx -t hibát jelez — ellenőrizd manuálisan: $NGINX_CONF_AVAILABLE" >&2
        fi
    fi
elif [[ -n "$DOMAIN" ]]; then
    echo ""
    if [[ -n "$OTHER_WEBSERVER" ]]; then
        echo "Megjegyzés: $OTHER_WEBSERVER webszerver található a rendszeren."
        echo "           Nginx konfig nem lett létrehozva — konfiguráld manuálisan a reverse proxyt."
    else
        echo "Megjegyzés: Nem található ismert webszerver (nginx, Apache, Caddy)."
        echo "           Nginx konfig nem lett létrehozva."
        echo "           Ha nginx-et szeretnél: sudo apt install nginx"
    fi
    echo "           A Go app a $APP_PORT porton fut és elérhető közvetlenül."
fi

# --- Összefoglalás ------------------------------------------------------------
sleep 2
echo ""
echo "--- Státusz ---"
systemctl status "$SERVICE_NAME" --no-pager -l || true

echo ""
if $WAS_RUNNING; then
    echo "Frissítés kész: $APP_NAME"
else
    echo "Telepítés kész: $APP_NAME"
fi

echo ""
echo "Hasznos parancsok:"
echo "  sudo systemctl status  $SERVICE_NAME"
echo "  sudo systemctl restart $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"

# Certbot útmutató (csak nginx esetén releváns)
if [[ -n "$DOMAIN" ]] && $NGINX_INSTALLED; then
    echo ""
    echo "--- HTTPS beállítása (certbot) ---"
    if command -v certbot &>/dev/null; then
        echo "Certbot megtalálva. HTTPS aktiváláshoz futtasd:"
        echo ""
        echo "  sudo certbot --nginx -d ${BARE_DOMAIN} -d ${WWW_DOMAIN}"
    else
        echo "Certbot nem található. Telepítés és HTTPS aktiválás:"
        echo ""
        echo "  sudo apt install certbot python3-certbot-nginx"
        echo "  sudo certbot --nginx -d ${BARE_DOMAIN} -d ${WWW_DOMAIN}"
    fi
    echo ""
    echo "A certbot automatikusan módosítja az nginx konfigot és beállítja az auto-megújítást."
fi
