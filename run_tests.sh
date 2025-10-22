#!/bin/bash

# Script para executar os testes da aplicação
# ===========================================

echo "🧪 Executando Suite de Testes"
echo "=============================="
echo ""

# Ativar ambiente virtual se existir
if [ -d "venv" ]; then
    echo "✓ Ativando ambiente virtual..."
    source venv/bin/activate
else
    echo "⚠️  Ambiente virtual não encontrado"
    echo "   Execute: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Verificar se pytest está instalado
if ! python -c "import pytest" 2>/dev/null; then
    echo "⚠️  pytest não encontrado. Instalando dependências de teste..."
    pip install pytest pytest-cov httpx
fi

echo ""
echo "Executando testes..."
echo ""

# Verificar argumentos
if [ "$1" == "--cov" ]; then
    # Executar com cobertura
    pytest --cov=app --cov-report=html --cov-report=term-missing
    echo ""
    echo "✓ Relatório de cobertura gerado em: htmlcov/index.html"
elif [ "$1" == "--verbose" ] || [ "$1" == "-v" ]; then
    # Executar com output verbose
    pytest -vv
elif [ "$1" == "--failed" ] || [ "$1" == "-f" ]; then
    # Executar apenas testes que falharam anteriormente
    pytest --lf -v
elif [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Uso: ./run_tests.sh [OPÇÕES]"
    echo ""
    echo "Opções:"
    echo "  (nenhuma)      Executa todos os testes"
    echo "  --cov          Executa testes com relatório de cobertura"
    echo "  --verbose, -v  Executa testes com output detalhado"
    echo "  --failed, -f   Executa apenas testes que falharam"
    echo "  --help, -h     Mostra esta mensagem"
    echo ""
    echo "Exemplos de uso direto do pytest:"
    echo "  pytest tests/test_auth.py              # Testar apenas autenticação"
    echo "  pytest tests/test_auth.py::TestAuth::test_login_success  # Teste específico"
    echo "  pytest -k auth                         # Testes que contém 'auth'"
    echo "  pytest -x                              # Parar no primeiro erro"
    echo ""
else
    # Executar todos os testes normalmente
    pytest
fi

# Capturar código de saída
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Todos os testes passaram\!"
else
    echo "❌ Alguns testes falharam (código: $EXIT_CODE)"
fi

echo ""

exit $EXIT_CODE

