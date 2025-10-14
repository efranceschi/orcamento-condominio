#!/bin/bash

# Script de inicialização do Sistema de Gerenciamento Orçamentário
# ================================================================

echo "🚀 Iniciando Sistema de Gerenciamento Orçamentário..."
echo ""

# Ativar ambiente virtual
if [ -d "venv" ]; then
    echo "✓ Ativando ambiente virtual..."
    source venv/bin/activate
else
    echo "✗ Ambiente virtual não encontrado!"
    echo "  Execute: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Verificar banco de dados
if [ ! -f "data/condominio_orcamento.db" ]; then
    echo "⚠️  Banco de dados não encontrado. Inicializando..."
    python init_db.py
    echo ""
fi

# Iniciar servidor
echo "✓ Iniciando servidor FastAPI..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Sistema de Gerenciamento Orçamentário"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Interface Web: http://localhost:8000"
echo "  API Docs:      http://localhost:8000/api/docs"
echo ""
echo "  Pressione CTRL+C para encerrar"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python main.py

