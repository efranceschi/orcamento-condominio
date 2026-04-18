#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# run.sh — Inicia o app em modo desenvolvimento
# ============================================================
#
# Uso:
#   ./run.sh            # Inicia normalmente
#   ./run.sh --release  # Inicia em modo release (mais rápido, sem debug)
#
# Pré-requisitos:
#   - Node.js 18+
#   - Rust (rustup)
#   - Dependências do sistema para Tauri v2
#     macOS: xcode-select --install
#     Linux: sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
#
# ============================================================

cd "$(dirname "$0")"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Calculadora Orçamentária — Dev Server   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Erro: Node.js não encontrado. Instale em https://nodejs.org${NC}"
    exit 1
fi
echo -e "  Node.js:  ${GREEN}$(node --version)${NC}"

# Verificar Rust
if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Erro: Rust não encontrado. Instale com:${NC}"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi
echo -e "  Rust:     ${GREEN}$(rustc --version | cut -d' ' -f2)${NC}"
echo -e "  Cargo:    ${GREEN}$(cargo --version | cut -d' ' -f2)${NC}"

# Instalar dependências npm se necessário
if [ ! -d "node_modules" ]; then
    echo ""
    echo -e "${YELLOW}Instalando dependências npm...${NC}"
    npm install
fi

echo ""

# Verificar flag --release
if [[ "${1:-}" == "--release" ]]; then
    echo -e "${YELLOW}Iniciando em modo RELEASE...${NC}"
    npm run tauri dev -- --release
else
    echo -e "${GREEN}Iniciando em modo desenvolvimento...${NC}"
    echo -e "  Frontend: ${YELLOW}http://localhost:1420${NC}"
    echo ""
    npm run tauri dev
fi
