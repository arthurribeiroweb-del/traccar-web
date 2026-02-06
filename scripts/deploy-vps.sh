#!/bin/bash
# Deploy Traccar na VPS: backup -> frontend (traccar-web) -> backend (tracker-server) -> restart
# Uso no servidor (exemplo):
#   sudo bash /opt/traccar-web-src/scripts/deploy-vps.sh
# Observacao: este script espera os fontes em /opt/traccar-web-src e /opt/traccar-server-src.
# Ajuste as variaveis WEB_SRC e SERVER_SRC abaixo se sua VPS usar outro caminho.

set -e

WEB_SRC="/opt/traccar-web-src"
SERVER_SRC="/opt/traccar-server-src"
TRACCAR="/opt/traccar"
BACKUP_DIR="/root"

if [ ! -d "$WEB_SRC" ]; then
  echo "ERRO: WEB_SRC nao encontrado: $WEB_SRC"
  echo "Ajuste o caminho do fonte do traccar-web."
  exit 1
fi

if [ ! -d "$SERVER_SRC" ]; then
  echo "ERRO: SERVER_SRC nao encontrado: $SERVER_SRC"
  echo "Ajuste o caminho do fonte do traccar-server."
  exit 1
fi

if [ ! -d "$TRACCAR" ]; then
  echo "ERRO: TRACCAR nao encontrado: $TRACCAR"
  echo "Ajuste o caminho da instalacao."
  exit 1
fi

# Aviso de duplicados do traccar-web em /opt (evita deploy no lugar errado)
DUPLICATES=$(find /opt -maxdepth 3 -type d -name "traccar-web" ! -path "$WEB_SRC" 2>/dev/null || true)
if [ -n "$DUPLICATES" ]; then
  echo "ATENCAO: encontrei possiveis clones duplicados do traccar-web em /opt:" 
  echo "$DUPLICATES"
  echo "Confirme se o deploy deve usar apenas $WEB_SRC."
fi

# Carregar nvm (node/npm) quando o script roda com sudo
export NVM_DIR="${NVM_DIR:-/root/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

echo "=== 1. BACKUP ==="
BACKUP_FILE="$BACKUP_DIR/backup-traccar-$(date +%F_%H%M).tgz"
sudo tar -czf "$BACKUP_FILE" "$TRACCAR/data" "$TRACCAR/conf/traccar.xml" "$TRACCAR/web"
echo "Backup salvo em $BACKUP_FILE"

echo ""
echo "=== 2. FRONTEND (traccar-web) ==="
cd "$WEB_SRC"
git pull
npm install
npm run build
sudo rm -rf "$TRACCAR/web/"*
sudo cp -r "$WEB_SRC/build/"* "$TRACCAR/web/"
echo "Frontend deployado. version: $(cat $TRACCAR/web/version.json 2>/dev/null || echo '?')"

echo ""
echo "=== 3. BACKEND (tracker-server) ==="
cd "$SERVER_SRC"
git pull
./gradlew assemble

echo ""
echo "=== 4. PARAR TRACCAR ==="
sudo systemctl stop traccar

echo ""
echo "=== 5. COPIAR JAR E TEMPLATES ==="
sudo cp "$SERVER_SRC/target/tracker-server.jar" "$TRACCAR/tracker-server.jar"
sudo cp -r "$SERVER_SRC/templates/"* "$TRACCAR/templates/"

echo ""
echo "=== 6. INICIAR TRACCAR ==="
sudo systemctl start traccar
sleep 3
sudo systemctl status traccar --no-pager

echo ""
echo "=== DEPLOY CONCLUIDO ==="