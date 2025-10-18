"""
Script para adicionar campos created_at e updated_at às categorias existentes
"""
from app.database import SessionLocal, engine
from sqlalchemy import text, inspect
from datetime import datetime

def migrate_timestamps():
    db = SessionLocal()
    inspector = inspect(engine)
    
    print("="*60)
    print("MIGRAÇÃO: Adicionar timestamps às categorias")
    print("="*60)
    
    try:
        # Verificar colunas existentes
        columns = [col['name'] for col in inspector.get_columns('budget_categories')]
        print(f"\nColunas atuais: {', '.join(columns)}")
        
        # Adicionar coluna created_at se não existir
        if 'created_at' not in columns:
            print("\n⚙️  Adicionando coluna 'created_at'...")
            db.execute(text(
                "ALTER TABLE budget_categories ADD COLUMN created_at TIMESTAMP"
            ))
            db.commit()
            print("✓ Coluna 'created_at' adicionada")
        else:
            print("\n✓ Coluna 'created_at' já existe")
        
        # Adicionar coluna updated_at se não existir
        if 'updated_at' not in columns:
            print("⚙️  Adicionando coluna 'updated_at'...")
            db.execute(text(
                "ALTER TABLE budget_categories ADD COLUMN updated_at TIMESTAMP"
            ))
            db.commit()
            print("✓ Coluna 'updated_at' adicionada")
        else:
            print("✓ Coluna 'updated_at' já existe")
        
        # Atualizar registros com valores NULL
        print("\n⚙️  Atualizando registros existentes...")
        
        now = datetime.utcnow().isoformat()
        result = db.execute(text(
            f"""
            UPDATE budget_categories 
            SET created_at = :timestamp,
                updated_at = :timestamp
            WHERE created_at IS NULL OR updated_at IS NULL
            """
        ), {"timestamp": now})
        db.commit()
        
        print(f"✓ {result.rowcount} registros atualizados")
        
        # Verificar resultado final
        columns_after = [col['name'] for col in inspector.get_columns('budget_categories')]
        print(f"\nColunas após migração: {', '.join(columns_after)}")
        
        print("\n" + "="*60)
        print("✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO")
        print("="*60)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        db.close()


if __name__ == "__main__":
    try:
        migrate_timestamps()
    except KeyboardInterrupt:
        print("\n\n⚠️  Execução interrompida pelo usuário")
    except Exception as e:
        print(f"\n\n❌ Erro fatal: {e}")

