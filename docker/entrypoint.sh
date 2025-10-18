#!/bin/bash
# Script de entrada do container
# Executa inicializações antes de iniciar a aplicação

set -e

echo "=========================================="
echo "  INICIANDO SISTEMA DE ORÇAMENTO"
echo "=========================================="

# Criar diretório de dados se não existir
echo "📁 Verificando diretórios..."
mkdir -p /app/data /var/log/uvicorn /var/log/nginx /var/log/supervisor

# Executar migrations se necessário
if [ -f "/app/migrations/migrate_add_users.py" ]; then
    echo "🔄 Executando migrations..."
    cd /app && python migrations/migrate_add_users.py 2>/dev/null || echo "ℹ️  Migrations já aplicadas ou não necessárias."
fi

echo "✅ Inicialização concluída!"
echo "🚀 Iniciando aplicação..."
echo "=========================================="

# Executar comando passado como argumento
exec "$@"
