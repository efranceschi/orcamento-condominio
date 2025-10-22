"""
Testes para endpoints de parâmetros do sistema
"""
import pytest


class TestParameters:
    """Testes de parâmetros do sistema"""
    
    def test_get_parameters(self, client, auth_headers):
        """Obter parâmetros do sistema"""
        response = client.get("/api/parameters", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_square_meters" in data
        assert "lot_simulation_1" in data
        assert "lot_simulation_2" in data
        assert "habite_se_discount" in data
    
    def test_get_parameters_no_auth(self, client):
        """Parâmetros requerem autenticação"""
        response = client.get("/api/parameters")
        assert response.status_code == 403  # 403 quando não há autenticação
    
    def test_update_parameters_as_admin(self, client, auth_headers):
        """Admin pode atualizar parâmetros"""
        response = client.put(
            "/api/parameters",
            headers=auth_headers,
            json={
                "total_square_meters": 12000.0,
                "lot_simulation_1": 600,
                "lot_simulation_2": 1200,
                "habite_se_discount": 15.0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_square_meters"] == 12000.0
        assert data["lot_simulation_1"] == 600
    
    def test_update_parameters_regular_user(self, client, user_auth_headers):
        """Usuário regular não pode atualizar parâmetros"""
        response = client.put(
            "/api/parameters",
            headers=user_auth_headers,
            json={
                "total_square_meters": 15000.0
            }
        )
        assert response.status_code == 403
    
    def test_update_parameters_partial(self, client, auth_headers):
        """Atualização parcial de parâmetros"""
        response = client.put(
            "/api/parameters",
            headers=auth_headers,
            json={
                "total_square_meters": 11000.0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_square_meters"] == 11000.0
        # Outros parâmetros devem permanecer
        assert data["lot_simulation_1"] is not None

