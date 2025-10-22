"""
Configurações e fixtures compartilhadas para os testes
"""
import pytest
import sys
import os
from pathlib import Path

# Adicionar diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.database import Base, get_db
from app.models import User, BudgetScenario, BudgetCategory, SystemParameters
from app.services.auth_service import get_password_hash


# Banco de dados de teste em memória
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Cria uma sessão de banco de dados para cada teste"""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    
    # Criar parâmetros padrão
    params = SystemParameters(
        total_square_meters=10000.0,
        lot_simulation_1=500,
        lot_simulation_2=1000,
        habite_se_discount=10.0
    )
    session.add(params)
    session.commit()
    
    yield session
    
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Cliente de teste da API"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def admin_user(db_session):
    """Cria um usuário admin para testes"""
    user = User(
        username="admin",
        full_name="Admin Test",
        password_hash=get_password_hash("Admin123!"),  # Senha forte
        role="admin",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def regular_user(db_session):
    """Cria um usuário regular para testes"""
    user = User(
        username="user",
        full_name="User Test",
        password_hash=get_password_hash("User123!"),  # Senha forte
        role="user",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def admin_token(client, admin_user):
    """Obtém token de autenticação do admin"""
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin123!"}  # Senha forte
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture(scope="function")
def user_token(client, regular_user):
    """Obtém token de autenticação do usuário regular"""
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "User123!"}  # Senha forte
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture(scope="function")
def auth_headers(admin_token):
    """Headers de autenticação para admin"""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="function")
def user_auth_headers(user_token):
    """Headers de autenticação para usuário regular"""
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="function")
def sample_scenario(db_session):
    """Cria um cenário de exemplo para testes"""
    scenario = BudgetScenario(
        name="Orçamento Teste 2026",
        year=2026,
        description="Cenário de teste",
        is_baseline=True
    )
    db_session.add(scenario)
    db_session.commit()
    db_session.refresh(scenario)
    return scenario


@pytest.fixture(scope="function")
def sample_categories(db_session, sample_scenario):
    """Cria categorias de exemplo para testes"""
    expense_cat = BudgetCategory(
        name="DESPESAS",
        item_type="expense",
        scenario_id=sample_scenario.id,
        order=1
    )
    revenue_cat = BudgetCategory(
        name="RECEITAS",
        item_type="revenue",
        scenario_id=sample_scenario.id,
        order=2
    )
    
    db_session.add_all([expense_cat, revenue_cat])
    db_session.commit()
    db_session.refresh(expense_cat)
    db_session.refresh(revenue_cat)
    
    return {"expense": expense_cat, "revenue": revenue_cat}

