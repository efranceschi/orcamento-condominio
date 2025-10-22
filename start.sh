#!/bin/bash

# Script de inicialização do Sistema de Gerenciamento Orçamentário
# ================================================================

# Verificar modos de operação
DEBUG_MODE=false
ACCESS_LOG_MODE=false

# Processar argumentos
for arg in "$@"; do
    case $arg in
        --debug|-d)
            DEBUG_MODE=true
            export DEBUG=true
            echo "🐛 MODO DEBUG ATIVADO"
            echo ""
            ;;
        --access-log|-a)
            ACCESS_LOG_MODE=true
            export ACCESS_LOG=true
            echo "📝 MODO ACCESS LOG ATIVADO"
            echo ""
            ;;
        --help|-h)
            echo "Uso: ./start.sh [OPÇÕES]"
            echo ""
            echo "Opções:"
            echo "  --debug, -d        Ativa logs verbosos completos"
            echo "  --access-log, -a   Ativa logs de acesso simplificados"
            echo "  --help, -h         Mostra esta mensagem de ajuda"
            echo ""
            exit 0
            ;;
        *)
            echo "⚠️  Opção desconhecida: $arg"
            echo "Use --help para ver as opções disponíveis"
            exit 1
            ;;
    esac
done

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
if [ "$DEBUG_MODE" = true ]; then
    echo "  🐛 Modo Debug: ATIVO (logs verbosos completos)"
elif [ "$ACCESS_LOG_MODE" = true ]; then
    echo "  📝 Modo Access Log: ATIVO (logs de acesso simplificados)"
else
    echo "  ℹ️  Logs: INATIVOS"
    echo "     Use ./start.sh --access-log para logs simples"
    echo "     Use ./start.sh --debug para logs completos"
fi
echo ""
echo "  Pressione CTRL+C para encerrar"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python main.py

