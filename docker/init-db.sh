#!/bin/bash
# Script de inicialização do banco de dados

set -e

DB_FILE="/app/data/condominio_orcamento.db"

echo "🔍 Verificando banco de dados..."

if [ ! -f "$DB_FILE" ]; then
    echo "📊 Banco de dados não encontrado. Criando..."
    
    # Criar o diretório se não existir
    mkdir -p /app/data
    
    # Executar script de inicialização (se existir)
    if [ -f "/app/init_db.py" ]; then
        echo "🚀 Executando init_db.py..."
        cd /app && python init_db.py
    fi
    
    echo "✅ Banco de dados criado com sucesso!"
else
    echo "✅ Banco de dados já existe."
fi

# Executar migrations se necessário
if [ -f "/app/migrate_add_users.py" ]; then
    echo "🔄 Executando migrations..."
    cd /app && python migrate_add_users.py 2>/dev/null || echo "ℹ️  Migrations já aplicadas ou não necessárias."
fi

echo "✅ Inicialização concluída!"

