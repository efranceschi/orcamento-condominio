"""
Testes para verificações de saúde da aplicação
"""
import pytest


class TestHealth:
    """Testes de health check"""
    
    def test_health_check(self, client):
        """Health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "timestamp" in data
        assert data["checks"]["database"] == "healthy"
    
    def test_root_redirect(self, client):
        """Página raiz redireciona para scenarios"""
        response = client.get("/", allow_redirects=False)
        assert response.status_code in [302, 307]
        assert "/scenarios" in response.headers.get("location", "")

