"""
Migração: Adicionar tabela de usuários
"""
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base, SQLALCHEMY_DATABASE_URL
from app.services.auth_service import get_password_hash

def migrate():
    print("🔄 Iniciando migração: Adicionar tabela users...")
    
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
    
    # Criar tabela users
    from app.models.user import User
    Base.metadata.create_all(bind=engine, tables=[User.__table__])
    
    print("✅ Tabela 'users' criada com sucesso!")
    
    # Criar usuário admin padrão
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Verificar se já existe algum usuário
        existing_user = db.query(User).first()
        
        if not existing_user:
            # Criar usuário admin padrão
            password = "admin123"
            admin_user = User(
                username="admin",
                password_hash=get_password_hash(password[:72]),  # Bcrypt limit
                full_name="Administrador",
                role="admin",
                is_active=True
            )
            
            db.add(admin_user)
            db.commit()
            
            print("✅ Usuário administrador criado com sucesso!")
            print("")
            print("📋 Credenciais padrão:")
            print("   Usuário: admin")
            print("   Senha: admin123")
            print("")
            print("⚠️  IMPORTANTE: Altere a senha após o primeiro login!")
        else:
            print("ℹ️  Já existem usuários cadastrados. Nenhum usuário padrão foi criado.")
    
    except Exception as e:
        print(f"❌ Erro ao criar usuário admin: {e}")
        db.rollback()
    finally:
        db.close()
    
    print("✅ Migração concluída!")

if __name__ == "__main__":
    migrate()

