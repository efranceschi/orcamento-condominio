"""
Script para atualizar estrutura da tabela lot_types
"""
from app.database import SessionLocal
from sqlalchemy import text, inspect

db = SessionLocal()
inspector = inspect(db.bind)

try:
    cols = [col['name'] for col in inspector.get_columns('lot_types')]
    print('Colunas atuais:', cols)
    
    if 'discount_percent' not in cols:
        db.execute(text('ALTER TABLE lot_types ADD COLUMN discount_percent REAL DEFAULT 10.0'))
        db.commit()
        print('✓ Coluna discount_percent adicionada')
    else:
        print('✓ Coluna discount_percent já existe')
    
    # SQLite não suporta DROP COLUMN diretamente, precisamos recriar a tabela
    if 'weight' in cols:
        print('⚠️  Coluna weight existe mas SQLite não suporta DROP COLUMN')
        print('   A coluna será ignorada pelo modelo')
    
    print('\n✅ Migração concluída')
    
except Exception as e:
    db.rollback()
    print(f'❌ Erro: {e}')

finally:
    db.close()

