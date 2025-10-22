# 🧪 Suite de Testes - Sistema de Gerenciamento Orçamentário

Esta é a suite de testes automatizados para o Sistema de Gerenciamento Orçamentário.

## 📋 Estrutura dos Testes

```
tests/
├── __init__.py                 # Inicialização do pacote
├── conftest.py                 # Fixtures compartilhadas
├── test_auth.py                # Testes de autenticação
├── test_budgets.py             # Testes de orçamentos/cenários e páginas
├── test_categories.py          # Testes de categorias
├── test_parameters.py          # Testes de parâmetros
└── test_health.py              # Testes de health check
```

## 🚀 Como Executar os Testes

### Método Rápido (Script)

```bash
# Executar todos os testes
./run_tests.sh

# Com cobertura de código
./run_tests.sh --cov

# Modo verbose
./run_tests.sh --verbose

# Apenas testes que falharam
./run_tests.sh --failed

# Ver ajuda
./run_tests.sh --help
```

### Método Manual (pytest direto)

```bash
# Ativar ambiente virtual
source venv/bin/activate

# Instalar dependências de teste (se necessário)
pip install -r requirements.txt

# Executar todos os testes
pytest

# Executar testes de um arquivo específico
pytest tests/test_auth.py

# Executar teste específico
pytest tests/test_auth.py::TestAuth::test_login_success

# Executar com cobertura
pytest --cov=app --cov-report=html

# Modo verbose
pytest -v

# Parar no primeiro erro
pytest -x

# Executar testes que contém palavra-chave
pytest -k auth
```

## 📊 Cobertura dos Testes

A suite atual cobre:

### ✅ Autenticação (test_auth.py)
- Login com sucesso
- Login com credenciais inválidas
- Obter usuário atual
- Mudança de senha
- Listagem de usuários (admin/user)
- Criação, atualização e deleção de usuários

### ✅ Orçamentos/Cenários (test_budgets.py)
- Listagem de cenários
- Filtros por ano e baseline
- Obtenção de cenário específico
- Criação de cenários (admin only)
- Atualização de cenários
- Deleção de cenários
- Resumo de cenários
- **Páginas HTML**: home, scenarios, parameters, categories, login, users, backup, detalhes, resumo, análise

### ✅ Categorias (test_categories.py)
- Listagem de categorias
- Filtro por cenário
- Criação de categorias e subcategorias
- Atualização de categorias
- Deleção de categorias
- Controle de acesso (admin/user)

### ✅ Parâmetros (test_parameters.py)
- Obtenção de parâmetros
- Atualização completa e parcial
- Controle de acesso (admin only)

### ✅ Health Check (test_health.py)
- Verificação de saúde da aplicação
- Verificação de banco de dados
- Redirecionamento da página raiz

## 🔧 Fixtures Disponíveis (conftest.py)

As seguintes fixtures estão disponíveis para todos os testes:

- `db_session`: Sessão de banco de dados em memória
- `client`: Cliente de teste FastAPI
- `admin_user`: Usuário administrador
- `regular_user`: Usuário regular
- `admin_token`: Token JWT do admin
- `user_token`: Token JWT do usuário regular
- `auth_headers`: Headers com autenticação admin
- `user_auth_headers`: Headers com autenticação user
- `sample_scenario`: Cenário de exemplo
- `sample_categories`: Categorias de exemplo (DESPESAS e RECEITAS)

## 📈 Relatório de Cobertura

Após executar com `--cov`, o relatório HTML estará disponível em:
```
htmlcov/index.html
```

Abra no navegador para visualização interativa da cobertura.

## ✨ Boas Práticas

1. **Sempre execute os testes** antes de fazer commit
2. **Adicione testes** para novas funcionalidades
3. **Mantenha alta cobertura** (mínimo 80%)
4. **Use fixtures** para evitar duplicação de código
5. **Nomes descritivos** para testes (test_*_success, test_*_failure)
6. **Organize por classe** funcionalidades relacionadas

## 🐛 Troubleshooting

### Erro: "No module named pytest"
```bash
pip install pytest pytest-cov httpx
```

### Erro: "Database locked"
Os testes usam banco em memória, não deve ocorrer. Se ocorrer, reinicie os testes.

### Testes falhando localmente mas passam no CI
Verifique se o banco de dados local está limpo e se as dependências estão atualizadas.

## 📝 Adicionando Novos Testes

1. Crie ou edite arquivo em `tests/test_*.py`
2. Use classes para agrupar testes relacionados
3. Use fixtures existentes do conftest.py
4. Siga o padrão AAA (Arrange, Act, Assert)

Exemplo:
```python
def test_nova_funcionalidade(client, auth_headers):
    # Arrange
    data = {"campo": "valor"}
    
    # Act
    response = client.post("/endpoint", headers=auth_headers, json=data)
    
    # Assert
    assert response.status_code == 201
    assert response.json()["campo"] == "valor"
```

## 🎯 Próximos Passos

- [ ] Adicionar testes para items (test_items.py)
- [ ] Adicionar testes para backup (test_backup.py)
- [ ] Adicionar testes de integração com Excel
- [ ] Adicionar testes de performance
- [ ] Configurar CI/CD para executar testes automaticamente

