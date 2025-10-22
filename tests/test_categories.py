"""
Testes para endpoints de categorias
"""
import pytest


class TestCategories:
    """Testes de categorias orçamentárias"""
    
    def test_list_categories(self, client, auth_headers, sample_categories):
        """Listar categorias"""
        response = client.get("/api/budgets/categories", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        assert len(categories) >= 2
    
    def test_list_categories_by_scenario(self, client, auth_headers, sample_scenario, sample_categories):
        """Filtrar categorias por cenário"""
        response = client.get(
            f"/api/budgets/categories?scenario_id={sample_scenario.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        categories = response.json()
        assert all(c["scenario_id"] == sample_scenario.id for c in categories)
    
    def test_get_category(self, client, auth_headers, sample_categories):
        """Obter categoria específica"""
        cat_id = sample_categories["expense"].id
        response = client.get(
            f"/api/budgets/categories/{cat_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == cat_id
        assert data["name"] == "DESPESAS"
    
    def test_create_category(self, client, auth_headers, sample_scenario):
        """Criar nova categoria"""
        response = client.post(
            "/api/budgets/categories",
            headers=auth_headers,
            json={
                "name": "Manutenção",
                "item_type": "expense",
                "scenario_id": sample_scenario.id,
                "order": 1
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Manutenção"
        assert data["item_type"] == "expense"
    
    def test_create_subcategory(self, client, auth_headers, sample_scenario, sample_categories):
        """Criar subcategoria"""
        parent_id = sample_categories["expense"].id
        response = client.post(
            "/api/budgets/categories",
            headers=auth_headers,
            json={
                "name": "Limpeza",
                "item_type": "expense",
                "scenario_id": sample_scenario.id,
                "parent_category_id": parent_id,
                "order": 1
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["parent_category_id"] == parent_id
    
    def test_update_category(self, client, auth_headers, sample_categories):
        """Atualizar categoria"""
        cat_id = sample_categories["expense"].id
        response = client.put(
            f"/api/budgets/categories/{cat_id}",
            headers=auth_headers,
            json={
                "name": "DESPESAS ATUALIZADAS",
                "order": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "DESPESAS ATUALIZADAS"
    
    def test_delete_category(self, client, auth_headers, db_session, sample_scenario):
        """Deletar categoria"""
        from app.models import BudgetCategory
        # Criar categoria temporária
        category = BudgetCategory(
            name="Temp Category",
            item_type="expense",
            scenario_id=sample_scenario.id,
            order=99
        )
        db_session.add(category)
        db_session.commit()
        db_session.refresh(category)
        
        response = client.delete(
            f"/api/budgets/categories/{category.id}",
            headers=auth_headers
        )
        assert response.status_code == 204
    
    def test_create_category_regular_user(self, client, user_auth_headers, sample_scenario):
        """Usuário regular não pode criar categoria"""
        response = client.post(
            "/api/budgets/categories",
            headers=user_auth_headers,
            json={
                "name": "Unauthorized Category",
                "item_type": "expense",
                "scenario_id": sample_scenario.id,
                "order": 1
            }
        )
        assert response.status_code == 403

