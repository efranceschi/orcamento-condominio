# Sistema de Migrations - Alembic

## Visão Geral

Este projeto utiliza **Alembic** para gerenciar versões e alterações do banco de dados SQLite de forma automática e controlada.

## Como Funciona

### Aplicação Automática

✅ **Migrations são aplicadas automaticamente** quando a aplicação inicia!

Não é necessário executar comandos manualmente. O sistema:
1. Verifica a versão atual do banco de dados
2. Detecta migrations pendentes
3. Aplica automaticamente todas as alterações necessárias
4. Registra a versão final na tabela `alembic_version`

### Quando São Aplicadas

As migrations rodam automaticamente em:
- ✅ Início da aplicação (`python main.py`)
- ✅ Startup do container Docker
- ✅ Após importar um banco de dados via backup

## Estrutura de Arquivos

```
projeto/
├── alembic/                          # Diretório do Alembic
│   ├── versions/                     # Migrations
│   │   └── 001_add_observations.py   # Migration 001
│   ├── env.py                        # Configuração do ambiente
│   ├── script.py.mako                # Template para migrations
│   └── README.md                     # Documentação do Alembic
├── alembic.ini                       # Configuração do Alembic
└── scripts/
    └── run_migrations.py             # Script CLI (opcional)
```

## Histórico de Migrations

### Migration 001 - Add Observations to Budget Items
**Data**: 2025-10-18
**Autor**: Sistema
**Descrição**: Adiciona campo `observations` (Text, nullable) na tabela `budget_items`

**Alterações**:
- ➕ Nova coluna: `budget_items.observations` (TEXT NULL)
- 📝 Permite adicionar comentários e justificativas aos itens orçamentários
- 💬 Acessível via ícone de comentário (💬) na interface

**Exemplo de uso**:
```python
item = db.query(BudgetItem).first()
item.observations = "Valor reajustado devido ao aumento do IPCA"
db.commit()
```

## Comandos Úteis (Opcionais)

### Verificar Status

```bash
# Ver versão atual do banco
alembic current

# Ver histórico de migrations
alembic history

# Ver migrations pendentes
alembic history --verbose
```

### Aplicar Migrations Manualmente

Normalmente não é necessário, mas se quiser:

```bash
# Aplicar todas as migrations pendentes
alembic upgrade head

# Aplicar migration específica
alembic upgrade 001

# Aplicar próxima migration
alembic upgrade +1
```

### Reverter Migrations

```bash
# Reverter última migration
alembic downgrade -1

# Reverter para migration específica
alembic downgrade 001

# Reverter todas
alembic downgrade base
```

### Script CLI Alternativo

```bash
# Usar o script Python diretamente
python scripts/run_migrations.py
```

## Criando Novas Migrations

### Quando Criar

Crie uma nova migration quando:
- ✅ Adicionar/remover colunas em tabelas
- ✅ Criar/remover tabelas
- ✅ Modificar tipos de dados
- ✅ Adicionar/remover índices
- ✅ Alterar constraints

### Método 1: Auto-geração (Recomendado)

```bash
# Modificar o model primeiro (ex: app/models/budget.py)
class BudgetItem(Base):
    # ... campos existentes ...
    new_field = Column(String, nullable=True)

# Gerar migration automaticamente
alembic revision --autogenerate -m "add new_field to budget_item"

# Revisar o arquivo gerado em alembic/versions/
# Testar a migration
alembic upgrade head
```

### Método 2: Manual

```bash
# Criar arquivo de migration em branco
alembic revision -m "add new_field to budget_item"

# Editar o arquivo gerado e implementar upgrade() e downgrade()
```

Exemplo de migration manual:

```python
"""add new_field to budget_item

Revision ID: 002
Revises: 001
Create Date: 2025-10-18 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'

def upgrade() -> None:
    """Add new_field column"""
    op.add_column('budget_items', sa.Column('new_field', sa.String(), nullable=True))

def downgrade() -> None:
    """Remove new_field column"""
    op.drop_column('budget_items', 'new_field')
```

## Boas Práticas

### ✅ Fazer

1. **Sempre teste migrations** em banco de desenvolvimento primeiro
2. **Implemente downgrade()** para poder reverter se necessário
3. **Use mensagens descritivas** nos commits
4. **Verifique o código auto-gerado** antes de aplicar
5. **Documente migrations complexas** neste arquivo

### ❌ Evitar

1. **Nunca edite migrations já aplicadas** - crie uma nova se precisar corrigir
2. **Não delete migrations antigas** - mantém o histórico
3. **Não force updates** sem backup
4. **Não pule versões** - aplique na ordem correta

## Compatibilidade com Backup/Restore

O sistema de migrations é **totalmente compatível** com o backup/restore:

1. **Ao importar backup antigo**:
   - Sistema detecta versão do banco importado
   - Aplica automaticamente migrations pendentes
   - Atualiza banco para versão mais recente

2. **Ao exportar backup**:
   - Versão atual é salva junto com os dados
   - Ao restaurar, migrations são aplicadas se necessário

## Troubleshooting

### Erro: "Target database is not up to date"

```bash
# Verificar versão atual
alembic current

# Aplicar migrations pendentes
alembic upgrade head
```

### Erro: "Can't locate revision identified by 'xxx'"

O banco está em uma versão que não existe mais. Soluções:

```bash
# Opção 1: Resetar versão (se banco novo)
alembic stamp head

# Opção 2: Restaurar de backup
# Use a interface de backup em /backup
```

### Migration falhou no meio

```bash
# Reverter migration problemática
alembic downgrade -1

# Corrigir o problema

# Tentar novamente
alembic upgrade head
```

### Verificar integridade

```bash
# Verificar se banco está consistente
sqlite3 data/condominio_orcamento.db "PRAGMA integrity_check;"

# Ver tabelas
sqlite3 data/condominio_orcamento.db ".tables"

# Ver versão Alembic
sqlite3 data/condominio_orcamento.db "SELECT * FROM alembic_version;"
```

## Integração com Docker

No Docker, as migrations são aplicadas automaticamente pelo `entrypoint.sh`:

```bash
# Migrations rodadas antes de iniciar a aplicação
echo "🔄 Verificando migrations..."
alembic upgrade head
echo "✓ Migrations aplicadas"
```

## Monitoramento

### Logs de Migration

Migrations geram logs no console durante o startup:

```
🔄 Verificando migrations...
INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 001, add observations to budget_items
✓ Migrations aplicadas com sucesso
```

### Verificar no Banco

```sql
-- Ver versão atual
SELECT * FROM alembic_version;

-- Ver se coluna foi adicionada
PRAGMA table_info(budget_items);
```

## Suporte

Para mais informações sobre Alembic:
- Documentação oficial: https://alembic.sqlalchemy.org/
- Tutorial: https://alembic.sqlalchemy.org/en/latest/tutorial.html
- Cookbook: https://alembic.sqlalchemy.org/en/latest/cookbook.html

## Resumo

✅ Migrations aplicadas automaticamente no startup
✅ Versionamento controlado do schema
✅ Reversível (downgrade disponível)
✅ Compatível com backup/restore
✅ Seguro e testado

**Você não precisa fazer nada manualmente!** O sistema gerencia tudo automaticamente. 🎉
