# Alembic - Sistema de Migrations

Este diretório contém as migrations do banco de dados usando Alembic.

## O que é Alembic?

Alembic é uma ferramenta de migração de banco de dados para SQLAlchemy. Ela permite:
- Versionamento do schema do banco de dados
- Aplicação automática de alterações no banco
- Rollback de alterações se necessário
- Histórico de todas as mudanças

## Aplicação Automática

As migrations são aplicadas automaticamente quando a aplicação inicia. O sistema verifica a versão atual do banco e aplica apenas as migrations necessárias.

## Comandos Úteis

### Ver versão atual do banco
```bash
alembic current
```

### Ver histórico de migrations
```bash
alembic history
```

### Aplicar migrations manualmente (até a mais recente)
```bash
alembic upgrade head
```

### Reverter última migration
```bash
alembic downgrade -1
```

### Criar uma nova migration
```bash
alembic revision -m "descrição da mudança"
```

### Gerar migration automaticamente (detecta mudanças nos models)
```bash
alembic revision --autogenerate -m "descrição da mudança"
```

## Estrutura de Arquivos

- `env.py` - Configuração do ambiente Alembic
- `script.py.mako` - Template para novas migrations
- `versions/` - Diretório com todas as migrations
  - `001_*.py` - Migration 001 (inicial)
  - `002_*.py` - Migration 002
  - etc.

## Histórico de Migrations

### 001 - Add observations to budget_items (2025-10-18)
- Adiciona campo `observations` (Text, nullable) na tabela `budget_items`
- Permite que usuários adicionem comentários/observações aos itens orçamentários

## Como Funciona

1. Quando a aplicação inicia, ela verifica qual a versão atual do banco
2. Compara com as migrations disponíveis em `versions/`
3. Aplica automaticamente todas as migrations pendentes
4. Registra a versão atual na tabela `alembic_version`

## Criando Nova Migration

Quando você adicionar/modificar um campo no modelo:

```python
# 1. Altere o modelo em app/models/*.py
class BudgetItem(Base):
    new_field = Column(String, nullable=True)

# 2. Crie a migration manualmente
alembic revision -m "add new_field to budget_item"

# 3. Edite o arquivo gerado em versions/ e implemente upgrade() e downgrade()

# 4. Teste a migration
alembic upgrade head
```

Ou use autogenerate (recomendado):

```bash
# Detecta automaticamente as mudanças
alembic revision --autogenerate -m "add new_field to budget_item"

# Revise o arquivo gerado e ajuste se necessário

# Aplique
alembic upgrade head
```

## Boas Práticas

1. **Sempre teste migrations** antes de fazer deploy
2. **Implemente downgrade()** para poder reverter se necessário
3. **Nunca edite migrations já aplicadas** - crie uma nova se precisar corrigir
4. **Use mensagens descritivas** nos commits
5. **Verifique se a migration pode ser aplicada em banco vazio** E em banco existente
