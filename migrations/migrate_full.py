"""
Script completo de migração do banco de dados
Adiciona:
- is_closed em budget_scenarios
- adjustment_percent em budget_categories  
- provisioned em budget_values
- Atualiza adjustment_percent em budget_values para aceitar NULL
"""
from app.database import SessionLocal
from sqlalchemy import text, inspect
from datetime import datetime

db = SessionLocal()
inspector = inspect(db.bind)

print("="*60)
print("MIGRAÇÃO COMPLETA DO BANCO DE DADOS")
print("="*60)

try:
    # 1. budget_scenarios
    print("\n📊 Tabela: budget_scenarios")
    cols = [col['name'] for col in inspector.get_columns('budget_scenarios')]
    
    if 'is_closed' not in cols:
        db.execute(text('ALTER TABLE budget_scenarios ADD COLUMN is_closed BOOLEAN DEFAULT 0'))
        db.commit()
        print("  ✓ Coluna 'is_closed' adicionada")
    else:
        print("  ✓ Coluna 'is_closed' já existe")
    
    # 2. budget_categories
    print("\n📁 Tabela: budget_categories")
    cols = [col['name'] for col in inspector.get_columns('budget_categories')]
    
    if 'adjustment_percent' not in cols:
        db.execute(text('ALTER TABLE budget_categories ADD COLUMN adjustment_percent REAL'))
        db.commit()
        print("  ✓ Coluna 'adjustment_percent' adicionada")
    else:
        print("  ✓ Coluna 'adjustment_percent' já existe")
    
    # 3. budget_values
    print("\n💰 Tabela: budget_values")
    cols = [col['name'] for col in inspector.get_columns('budget_values')]
    
    if 'provisioned' not in cols:
        db.execute(text('ALTER TABLE budget_values ADD COLUMN provisioned REAL'))
        db.commit()
        print("  ✓ Coluna 'provisioned' adicionada")
    else:
        print("  ✓ Coluna 'provisioned' já existe")
    
    # Nota: SQLite não suporta ALTER COLUMN para mudar de DEFAULT para NULL
    # O modelo já reflete isso, então novos registros seguirão a nova regra
    print("  ℹ️  Campo 'adjustment_percent' aceita NULL (novos registros)")
    
    print("\n" + "="*60)
    print("✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO")
    print("="*60)
    
    # Verificar estrutura final
    print("\n📋 RESUMO DAS TABELAS:")
    
    for table in ['budget_scenarios', 'budget_categories', 'budget_values']:
        cols = [col['name'] for col in inspector.get_columns(table)]
        print(f"\n{table}:")
        for col in cols:
            print(f"  - {col}")
    
except Exception as e:
    db.rollback()
    print(f"\n❌ ERRO: {e}")
    import traceback
    traceback.print_exc()

finally:
    db.close()

