"""
Testes para endpoints de orçamentos/cenários
"""
import pytest


class TestScenarios:
    """Testes de cenários orçamentários"""
    
    def test_list_scenarios(self, client, auth_headers, sample_scenario):
        """Listar cenários"""
        response = client.get("/api/budgets/scenarios", headers=auth_headers)
        assert response.status_code == 200
        scenarios = response.json()
        assert len(scenarios) >= 1
        assert any(s["name"] == "Orçamento Teste 2026" for s in scenarios)
    
    def test_list_scenarios_no_auth(self, client):
        """Listar cenários sem autenticação"""
        response = client.get("/api/budgets/scenarios")
        assert response.status_code == 403  # 403 quando não há autenticação
    
    def test_list_scenarios_filter_by_year(self, client, auth_headers, sample_scenario):
        """Filtrar cenários por ano"""
        response = client.get(
            "/api/budgets/scenarios?year=2026",
            headers=auth_headers
        )
        assert response.status_code == 200
        scenarios = response.json()
        assert all(s["year"] == 2026 for s in scenarios)
    
    def test_get_scenario(self, client, auth_headers, sample_scenario):
        """Obter cenário específico"""
        response = client.get(
            f"/api/budgets/scenarios/{sample_scenario.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_scenario.id
        assert data["name"] == "Orçamento Teste 2026"
    
    def test_get_nonexistent_scenario(self, client, auth_headers):
        """Tentar obter cenário inexistente"""
        response = client.get(
            "/api/budgets/scenarios/99999",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_create_scenario(self, client, auth_headers):
        """Criar novo cenário"""
        response = client.post(
            "/api/budgets/scenarios",
            headers=auth_headers,
            json={
                "name": "Novo Orçamento 2027",
                "year": 2027,
                "description": "Teste de criação",
                "is_baseline": False
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Novo Orçamento 2027"
        assert data["year"] == 2027
    
    def test_create_scenario_regular_user(self, client, user_auth_headers):
        """Usuário regular não pode criar cenário"""
        response = client.post(
            "/api/budgets/scenarios",
            headers=user_auth_headers,
            json={
                "name": "Orçamento Unauthorized",
                "year": 2027,
                "description": "Não deve funcionar",
                "is_baseline": False
            }
        )
        assert response.status_code == 403
    
    def test_update_scenario(self, client, auth_headers, sample_scenario):
        """Atualizar cenário"""
        response = client.put(
            f"/api/budgets/scenarios/{sample_scenario.id}",
            headers=auth_headers,
            json={
                "name": "Orçamento Atualizado 2026",
                "description": "Descrição atualizada"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Orçamento Atualizado 2026"
        assert data["description"] == "Descrição atualizada"
    
    def test_delete_scenario(self, client, auth_headers, db_session):
        """Deletar cenário"""
        # Criar cenário temporário
        from app.models import BudgetScenario
        scenario = BudgetScenario(name="Temp", year=2025, is_baseline=False)
        db_session.add(scenario)
        db_session.commit()
        db_session.refresh(scenario)
        
        response = client.delete(
            f"/api/budgets/scenarios/{scenario.id}",
            headers=auth_headers
        )
        assert response.status_code == 204
    
    def test_get_scenario_summary(self, client, auth_headers, sample_scenario, sample_categories):
        """Obter resumo do cenário"""
        response = client.get(
            f"/api/budgets/scenarios/{sample_scenario.id}/summary",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_expenses" in data
        assert "total_revenues" in data
        assert "balance" in data
        assert "categories" in data


class TestPages:
    """Testes de páginas HTML"""
    
    def test_home_page(self, client):
        """Página inicial redireciona"""
        response = client.get("/", allow_redirects=False)
        assert response.status_code in [302, 307]
    
    def test_scenarios_page(self, client):
        """Página de cenários"""
        response = client.get("/scenarios")
        assert response.status_code == 200
        assert b"text/html" in response.headers.get("content-type", "").encode()
    
    def test_parameters_page(self, client):
        """Página de parâmetros"""
        response = client.get("/parameters")
        assert response.status_code == 200
    
    def test_categories_page(self, client):
        """Página de categorias"""
        response = client.get("/categories")
        assert response.status_code == 200
    
    def test_login_page(self, client):
        """Página de login"""
        response = client.get("/login")
        assert response.status_code == 200
    
    def test_users_page(self, client):
        """Página de usuários"""
        response = client.get("/users")
        assert response.status_code == 200
    
    def test_backup_page(self, client):
        """Página de backup"""
        response = client.get("/backup")
        assert response.status_code == 200
    
    def test_scenario_details_page(self, client, sample_scenario):
        """Página de detalhes do cenário"""
        response = client.get(f"/scenarios/{sample_scenario.id}/details")
        assert response.status_code == 200
    
    def test_scenario_summary_page(self, client, sample_scenario):
        """Página de resumo do cenário"""
        response = client.get(f"/scenarios/{sample_scenario.id}/summary")
        assert response.status_code == 200
    
    def test_scenario_analysis_page(self, client, sample_scenario):
        """Página de análise do cenário"""
        response = client.get(f"/scenarios/{sample_scenario.id}/analysis")
        assert response.status_code == 200

