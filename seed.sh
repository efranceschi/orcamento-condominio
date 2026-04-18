#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# seed.sh — Popula o banco de dados com dados iniciais
# ============================================================
#
# Uso:
#   ./seed.sh                    # Detecta o banco automaticamente
#   ./seed.sh /caminho/banco.db  # Usa um banco específico
#
# ============================================================

cd "$(dirname "$0")"

GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Seed de Dados — Calculadora Orçamentária ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "Erro: python3 não encontrado."
    exit 1
fi

python3 scripts/seed_data.py "$@"
