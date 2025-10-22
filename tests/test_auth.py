"""
Testes para endpoints de autenticação
"""
import pytest


class TestAuth:
    """Testes de autenticação e autorização"""
    
    def test_login_success(self, client, admin_user):
        """Teste de login com sucesso"""
        response = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "Admin123!"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
    
    def test_login_wrong_password(self, client, admin_user):
        """Teste de login com senha errada"""
        response = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrongpassword"}
        )
        assert response.status_code == 401
    
    def test_login_nonexistent_user(self, client):
        """Teste de login com usuário inexistente"""
        response = client.post(
            "/api/auth/login",
            json={"username": "nonexistent", "password": "password"}
        )
        assert response.status_code == 401
    
    def test_get_current_user(self, client, auth_headers):
        """Teste para obter usuário atual"""
        response = client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"
        assert data["role"] == "admin"
    
    def test_get_current_user_no_token(self, client):
        """Teste sem token de autenticação"""
        response = client.get("/api/auth/me")
        assert response.status_code == 403  # 403 quando não há autenticação
    
    def test_change_password(self, client, auth_headers):
        """Teste de mudança de senha"""
        response = client.put(
            "/api/auth/change-password",
            headers=auth_headers,
            json={
                "current_password": "Admin123!",  # Senha atual forte
                "new_password": "NewPassword123!"  # Nova senha forte
            }
        )
        assert response.status_code == 200
        
        # Tentar fazer login com nova senha
        response = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "NewPassword123!"}
        )
        assert response.status_code == 200
    
    def test_change_password_wrong_current(self, client, auth_headers):
        """Teste de mudança de senha com senha atual errada"""
        response = client.put(
            "/api/auth/change-password",
            headers=auth_headers,
            json={
                "current_password": "wrongpassword",
                "new_password": "NewPassword123!"  # Senha forte
            }
        )
        assert response.status_code == 401  # 401 quando senha atual está incorreta


class TestUsers:
    """Testes de gerenciamento de usuários"""
    
    def test_list_users_as_admin(self, client, auth_headers, admin_user):
        """Admin pode listar usuários"""
        response = client.get("/api/users", headers=auth_headers)
        assert response.status_code == 200
        users = response.json()
        assert len(users) >= 1
        assert any(u["username"] == "admin" for u in users)
    
    def test_list_users_as_regular_user(self, client, user_auth_headers):
        """Usuário regular não pode listar usuários"""
        response = client.get("/api/users", headers=user_auth_headers)
        assert response.status_code == 403
    
    def test_create_user_as_admin(self, client, auth_headers):
        """Admin pode criar usuário"""
        response = client.post(
            "/api/users",
            headers=auth_headers,
            json={
                "username": "newuser",
                "full_name": "New User",
                "password": "Password123!",  # Senha forte com caractere especial
                "role": "user"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser"
        assert data["role"] == "user"
    
    def test_create_duplicate_user(self, client, auth_headers, admin_user):
        """Não pode criar usuário duplicado"""
        response = client.post(
            "/api/users",
            headers=auth_headers,
            json={
                "username": "admin",
                "full_name": "Admin 2",
                "password": "password123",
                "role": "admin"
            }
        )
        assert response.status_code == 400
    
    def test_update_user(self, client, auth_headers, regular_user):
        """Admin pode atualizar usuário"""
        response = client.put(
            f"/api/users/{regular_user.id}",
            headers=auth_headers,
            json={
                "full_name": "Updated Name"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["full_name"] == "Updated Name"
    
    def test_delete_user(self, client, auth_headers, regular_user):
        """Admin pode deletar usuário"""
        response = client.delete(
            f"/api/users/{regular_user.id}",
            headers=auth_headers
        )
        assert response.status_code == 204

