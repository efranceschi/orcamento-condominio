# PRD — Sistema de Gerenciamento Orçamentário para Condomínios

**Versão:** 1.0
**Data:** 2026-04-18
**Autor:** Eduardo Franceschi (com assistência de IA)
**Plataforma alvo:** Desktop (Windows, macOS, Linux) via Tauri v2 + Rust

---

## 1. Visão Geral

### 1.1 Objetivo

Aplicação desktop stand-alone para criação, ajuste e calibragem de orçamentos de condomínios residenciais. O sistema permite gerenciar múltiplos cenários orçamentários, simular ajustes, comparar propostas e gerar relatórios em PDF — tudo localmente, sem necessidade de servidor ou internet.

### 1.2 Problema que Resolve

A gestão orçamentária de condomínios residenciais (especialmente condomínios de lotes) envolve:
- Estruturas hierárquicas complexas de despesas e receitas
- Necessidade de simular diferentes cenários de reajuste
- Cálculos específicos como taxa de manutenção por m², desconto de habite-se
- Comparação entre propostas orçamentárias
- Geração de relatórios para apresentação em assembleia

Atualmente isso é feito em planilhas Excel, que são frágeis, difíceis de manter e não oferecem visualizações adequadas.

### 1.3 Público-Alvo

- Síndicos e administradores de condomínios residenciais
- Empresas de administração condominial
- Conselheiros fiscais de condomínios

### 1.4 Princípios do Produto

- **Stand-alone**: Funciona 100% offline, sem servidor nem login
- **Portável**: Instalável em Windows, macOS e Linux
- **Simples**: Interface com postura de app desktop nativo, sem complexidade desnecessária
- **Confiável**: Banco de dados local com export/import em formato aberto (JSON)

---

## 2. Arquitetura Técnica

### 2.1 Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Shell/Runtime | Tauri v2 | App desktop multiplataforma, leve (~5MB), WebView nativo |
| Frontend | React + TypeScript + Vite | Ecossistema maduro, tipagem forte |
| Componentes UI | Shadcn/UI (Radix + Tailwind CSS) | Visual moderno com comportamento desktop nativo |
| Gráficos | Recharts | Compatível com React, declarativo, leve |
| Backend/Lógica | Rust | Performance, segurança, acesso ao banco |
| Banco de dados | SQLite via `rusqlite` | Leve, embutido, sem dependências externas |
| Geração de PDF | `genpdf` ou `printpdf` | Geração nativa em Rust |
| Serialização | `serde` + `serde_json` | Export/import JSON nativo |

### 2.2 Arquitetura de Comunicação

```
┌─────────────────────────────────────────────┐
│                  Tauri Shell                │
│  ┌────────────────┐  ┌────────────────────┐ │
│  │  Frontend      │  │  Backend (Rust)    │ │
│  │  React + TS    │◄─┤                    │ │
│  │  Shadcn/UI     │  │ Lógica de Negócio  │ │
│  │  Recharts      ├─►│ Acesso a Dados     │ │
│  │                │  │ Geração de PDF     │ │
│  │                │  │ Export/Import JSON │ │
│  └────────────────┘  └────────┬───────────┘ │
│         IPC (Tauri Commands)  │             │
│                               ▼             │
│                         ┌──────────┐        │
│                         │  SQLite  │        │
│                         └──────────┘        │
└─────────────────────────────────────────────┘
```

- **Frontend → Backend**: via Tauri Commands (IPC nativo, tipado)
- **Backend → Banco**: via `rusqlite` (queries diretas ou ORM leve)
- **Sem HTTP**: toda comunicação é intra-processo via IPC do Tauri

### 2.3 Estrutura de Diretórios (Proposta)

```
orcamento-tauri/
├── src-tauri/                  # Backend Rust
│   ├── src/
│   │   ├── main.rs             # Entry point Tauri
│   │   ├── commands/           # Tauri Commands (handlers IPC)
│   │   │   ├── scenarios.rs
│   │   │   ├── categories.rs
│   │   │   ├── items.rs
│   │   │   ├── parameters.rs
│   │   │   ├── analysis.rs
│   │   │   ├── pdf.rs
│   │   │   └── backup.rs
│   │   ├── models/             # Structs de dados
│   │   │   ├── scenario.rs
│   │   │   ├── category.rs
│   │   │   ├── item.rs
│   │   │   ├── value.rs
│   │   │   └── parameters.rs
│   │   ├── services/           # Lógica de negócio
│   │   │   ├── budget_service.rs
│   │   │   ├── analysis_service.rs
│   │   │   ├── pdf_service.rs
│   │   │   └── backup_service.rs
│   │   └── db/                 # Acesso a dados
│   │       ├── mod.rs
│   │       ├── schema.rs       # DDL / migrations
│   │       └── queries.rs      # Queries SQL
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                        # Frontend React
│   ├── components/
│   │   ├── ui/                 # Shadcn/UI components
│   │   ├── layout/             # Sidebar, Header, etc.
│   │   ├── scenarios/          # Componentes de cenários
│   │   ├── categories/         # Componentes de categorias
│   │   ├── items/              # Componentes de itens
│   │   ├── analysis/           # Gráficos e análise
│   │   └── common/             # Componentes reutilizáveis
│   ├── pages/                  # Páginas/telas
│   ├── hooks/                  # React hooks customizados
│   ├── lib/                    # Utilitários (formatação, etc.)
│   ├── types/                  # TypeScript types
│   └── App.tsx
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Modelo de Dados

### 3.1 Diagrama de Entidades e Relacionamentos

```
BudgetScenario (cenário orçamentário)
│
├── 1:N ── BudgetCategory (categorias)
│          │
│          ├── self-ref ── parent_category (subcategorias)
│          │
│          └── 1:N ── BudgetItem (itens)
│                     │
│                     └── 1:N ── BudgetValue (valores)
│
└── self-ref ── base_scenario (cenário base/origem)

SystemParameters (registro único, configurações globais)
```

### 3.2 Tabela: budget_scenarios

Cenários orçamentários. Cada cenário representa uma proposta ou versão do orçamento.

| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|-------------|---------|-----------|
| id | INTEGER | Sim | AUTO | Chave primária |
| name | TEXT | Sim | — | Nome do cenário (ex: "Orçamento 2027") |
| description | TEXT | Não | NULL | Descrição livre |
| year | INTEGER | Sim | — | Ano de referência |
| base_scenario_id | INTEGER | Não | NULL | FK para cenário base (auto-referência) |
| is_baseline | BOOLEAN | Não | false | Se é o orçamento realizado (base de comparação) |
| is_approved | BOOLEAN | Não | false | Se foi aprovado em assembleia |
| is_closed | BOOLEAN | Não | false | Se está fechado para edição |
| general_adjustment | REAL | Não | 0.0 | Percentual de reajuste geral (%) |
| risk_margin | REAL | Não | 0.0 | Margem de risco adicional (%) |
| created_at | DATETIME | Não | now() | Data de criação |
| updated_at | DATETIME | Não | now() | Data da última atualização |

**Regras:**
- Um cenário pode ter um `base_scenario_id` apontando para outro cenário (cenário de origem)
- `is_closed = true` impede qualquer alteração nos dados do cenário
- `is_baseline = true` indica que os valores deste cenário são o "realizado" do ano anterior
- `general_adjustment` é o fallback quando item e categoria não têm ajuste próprio

### 3.3 Tabela: budget_categories

Categorias e subcategorias orçamentárias, organizadas em árvore hierárquica.

| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|-------------|---------|-----------|
| id | INTEGER | Sim | AUTO | Chave primária |
| scenario_id | INTEGER | Sim | — | FK para budget_scenarios |
| parent_category_id | INTEGER | Não | NULL | FK para budget_categories (auto-referência) |
| name | TEXT | Sim | — | Nome da categoria |
| description | TEXT | Não | NULL | Descrição |
| code | TEXT | Não | NULL | Código hierárquico (ex: "01", "01.02") |
| item_type | TEXT | Sim | — | Tipo: "expense" (despesa) ou "revenue" (receita) |
| order | INTEGER | Não | 0 | Ordem de exibição entre irmãos |
| adjustment_percent | REAL | Não | NULL | Percentual de reajuste da categoria (%) |
| created_at | DATETIME | Não | now() | Data de criação |
| updated_at | DATETIME | Não | now() | Data da última atualização |

**Enum ItemType:**
- `expense` — Despesa
- `revenue` — Receita

**Regras:**
- Categorias raiz: `parent_category_id = NULL`
- Subcategorias herdam o `item_type` da categoria pai (não pode misturar despesa/receita)
- Ao inicializar um cenário, duas categorias raiz são criadas automaticamente: "DESPESAS" e "RECEITAS"
- Não é permitido deletar categoria que possua subcategorias ou itens
- Campo `order` controla a sequência de exibição e pode ser reordenado (swap entre irmãos)
- `adjustment_percent` sobrescreve o `general_adjustment` do cenário para todos os itens da categoria

### 3.4 Tabela: budget_items

Itens individuais dentro de uma categoria orçamentária.

| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|-------------|---------|-----------|
| id | INTEGER | Sim | AUTO | Chave primária |
| category_id | INTEGER | Sim | — | FK para budget_categories |
| name | TEXT | Sim | — | Nome do item (ex: "Energia Elétrica") |
| description | TEXT | Não | NULL | Descrição detalhada |
| unit | TEXT | Não | NULL | Unidade de medida |
| order | INTEGER | Não | 0 | Ordem de exibição |
| adjustment_percent | REAL | Não | NULL | Percentual de reajuste específico do item (%) |
| repeats_next_budget | BOOLEAN | Não | false | Se o item NÃO se repete no próximo orçamento |
| is_optional | BOOLEAN | Não | false | Se o item é opcional (incluível/excluível na análise) |
| observations | TEXT | Não | NULL | Observações livres sobre o item |

**Regras:**
- Um item pertence a exatamente uma categoria
- `repeats_next_budget = true` significa que o valor estimado será 0 (item pontual)
- `is_optional = true` permite que o item seja incluído/excluído nos cálculos de análise de viabilidade
- `adjustment_percent` tem a maior prioridade na hierarquia de ajustes

### 3.5 Tabela: budget_values

Valores financeiros associados a cada item. Cada item possui um registro de valores.

| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|-------------|---------|-----------|
| id | INTEGER | Sim | AUTO | Chave primária |
| item_id | INTEGER | Sim | — | FK para budget_items |
| budgeted | REAL | Não | 0.0 | Valor orçado (R$) |
| realized | REAL | Não | NULL | Valor realizado (R$) |
| adjusted | REAL | Não | NULL | Valor proposto/ajustado (R$) |
| estimated_fixed | REAL | Não | NULL | Valor estimado fixo (sobrescreve cálculo) |
| adjustment_percent | REAL | Não | NULL | Percentual de ajuste específico do valor |
| custom_adjustment | REAL | Não | NULL | Ajuste customizado em valor absoluto |
| notes | TEXT | Não | NULL | Notas sobre o valor |
| created_at | DATETIME | Não | now() | Data de criação |
| updated_at | DATETIME | Não | now() | Data da última atualização |

**Propriedades Calculadas (não persistidas, calculadas em tempo de leitura):**

| Propriedade | Fórmula |
|-------------|---------|
| `total_used` | `realized` ou `0` se null |
| `used_percent` | `(total_used / budgeted) × 100` |
| `estimated` | Ver seção 5.1 |
| `variance` | `realized - budgeted` (se realized não-null) |
| `variance_percent` | `((realized - budgeted) / budgeted) × 100` |

### 3.6 Tabela: system_parameters

Registro único (singleton) com parâmetros de configuração do condomínio.

| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|-------------|---------|-----------|
| id | INTEGER | Sim | AUTO | Chave primária |
| total_square_meters | REAL | Sim | 0.0 | Área total do condomínio (m²) |
| lot_simulation_1 | REAL | Sim | 0.0 | Tamanho do lote simulação 1 — pequeno (m²) |
| lot_simulation_2 | REAL | Sim | 0.0 | Tamanho do lote simulação 2 — médio (m²) |
| lot_simulation_3 | REAL | Sim | 0.0 | Tamanho do lote simulação 3 — grande (m²) |
| habite_se_discount | REAL | Sim | 10.0 | Desconto para lotes com habite-se (%) |

**Regras:**
- Apenas um registro existe nesta tabela
- Se não existir, é criado automaticamente com os defaults
- `habite_se_discount` deve estar entre 0 e 100

---

## 4. Telas e Fluxos de Interface

### 4.1 Navegação Principal

O app utiliza uma **sidebar fixa à esquerda** com navegação por seções, em estilo desktop:

```
┌──────────┬─────────────────────────────────────┐
│          │                                     │
│  SIDEBAR │       ÁREA DE CONTEÚDO              │
│          │                                     │
│  Cenários│       (muda conforme navegação)     │
│  Categ.  │                                     │
│  Parâm.  │                                     │
│  Backup  │                                     │
│          │                                     │
│          │                                     │
│  ──────  │                                     │
│  versão  │                                     │
└──────────┴─────────────────────────────────────┘
```

**Itens da sidebar:**
1. **Orçamentos** (ícone: documento) — Lista e gerencia cenários
2. **Categorias** (ícone: pasta) — Gerencia hierarquia de categorias
3. **Parâmetros** (ícone: engrenagem) — Configurações do condomínio
4. **Backup** (ícone: download) — Exportar/importar dados

**Rodapé da sidebar:** Versão do aplicativo

### 4.2 Tela: Lista de Cenários (Orçamentos)

**Rota:** `/` (tela inicial)

**Layout:**
- Cabeçalho com título "Orçamentos" e botão "Novo Orçamento"
- Filtros: por ano (dropdown) e por tipo (Todos / Base / Simulação)
- Campo de busca por nome
- Grid de cards, cada card representando um cenário

**Card de Cenário:**
- Nome do cenário (título)
- Descrição (texto secundário)
- Badges: tipo (Base/Simulação), status (Aprovado/Pendente/Fechado)
- Metadados: Ano, Ajuste Geral (%), Margem de Risco (%)
- Botões de ação:
  - Ver Detalhes — abre tela de detalhes do cenário
  - Ver Resumo — abre tela de resumo com gráficos
  - Análise — abre tela de análise de viabilidade
  - Baixar PDF — gera e salva PDF
  - Editar — abre modal de edição de metadados
  - Fechar/Reabrir — alterna estado fechado
  - Aprovar — marca como aprovado
  - Excluir — com confirmação

**Modal: Criar/Editar Cenário:**
- Campos:
  - Nome (texto, obrigatório)
  - Ano (numérico, obrigatório)
  - Descrição (textarea, opcional)
  - Tipo base:
    - "Do zero" — cenário vazio
    - "Copiar ano anterior" — copia estrutura do cenário baseline do ano anterior
    - "Copiar cenário específico" — seleciona cenário existente como base
  - Checkbox: "Marcar como orçamento realizado" (is_baseline)
- Botões: Salvar / Cancelar

### 4.3 Tela: Detalhes do Cenário (Visão Completa)

**Rota:** `/scenarios/:id/details`

**Layout:**
- Cabeçalho com nome do cenário, ano, badges de status
- Duas abas: "Despesas" e "Receitas"
- Botões: Expandir Tudo / Recolher Tudo / Adicionar Item
- Filtros: busca por nome, filtro por "Com Ajuste" / "Sem Ajuste"

**Estrutura Hierárquica:**
Para cada categoria raiz, exibe árvore colapsável:

```
▼ 01 — DESPESAS GERAIS COM PESSOAL          Total: R$ 1.500.000,00
    ▼ 01.01 — TOTAL SALÁRIOS E ENCARGOS     Subtotal: R$ 961.800,00
        Salários / Adicionais / Horas Extras   R$ 710.000   R$ 608.756   ██████████ 85,7%   7,5%+2M   R$ 779.250
        INSS - 25,5%                           R$ 182.000   R$ 170.224   ██████████ 93,5%   7,5%+2M   R$ 199.290
        ...
    ▼ 01.02 — TOTAL FÉRIAS E ENCARGOS        Subtotal: R$ 126.440,00
        ...
```

**Colunas da tabela de itens:**
| Coluna | Descrição |
|--------|-----------|
| Nome | Nome do item (com indicadores ⭐ opcional, 🚫 não-repete) |
| Orçado (R$) | Valor orçado |
| Realizado (R$) | Valor realizado (vermelho se > orçado) |
| Utilizado (%) | Barra de progresso colorida (verde < 75%, laranja 75-90%, vermelho > 90%) |
| Ajuste+Margem (%) | Percentual de ajuste efetivo + margem de risco |
| Estimado (R$) | Valor estimado para próximo período |

**Ações por item:**
- Adicionar/editar observação (ícone de comentário com tooltip)
- Editar item (abre modal)
- Excluir item (com confirmação)

**Modal: Criar/Editar Item:**
- Campos:
  - Nome (texto, obrigatório)
  - Valor Orçado (R$, numérico)
  - Valor Realizado (R$, numérico, opcional)
  - Percentual de Ajuste (%, numérico, opcional)
  - Valor Estimado Fixo (R$, numérico, opcional — sobrescreve cálculo)
  - Checkbox: "Não se repete no próximo orçamento"
  - Checkbox: "Item opcional"
- Botões: Salvar / Cancelar

**Persistência de estado:**
- Estado expandido/colapsado das categorias é salvo localmente (localStorage) e restaurado ao reabrir

### 4.4 Tela: Resumo do Cenário

**Rota:** `/scenarios/:id/summary`

**Layout em seções:**

**Seção 1 — Cards de Totais:**
- Total de Despesas (R$) — card vermelho
- Total de Receitas (R$) — card verde
- Saldo (R$) — card verde se positivo, vermelho se negativo

**Seção 2 — Gráfico: Receitas vs. Despesas:**
- Gráfico de rosca (doughnut) mostrando proporção receitas/despesas
- Legenda com nomes de categorias e percentuais

**Seção 3 — Gráfico: Breakdown de Receitas:**
- Gráfico de rosca com cada categoria de receita como fatia
- Tooltip com nome e valor

**Seção 4 — Gráfico: Execução Orçamentária:**
- Gráfico gauge mostrando percentual de utilização
- Texto central com percentual e status ("Em Dia", "Atenção", "Crítico")
- Cores: verde < 75%, laranja 75-90%, vermelho > 90%

**Seção 5 — Despesas Problemáticas:**
- Gráfico de barras com top despesas por categoria
- Lista com: categoria, orçado, realizado, estouro (R$), estouro (%)
- Destaque vermelho para itens com realizado > orçado

**Seção 6 — Oportunidades de Economia:**
- Gráfico de rosca: não-gasto vs. realizado
- Lista com: categoria, orçado, realizado, economia disponível (R$), percentual

**Seção 7 — Tabela de Categorias:**
- Tabela com todas as categorias mostrando:
  - Nome, Ajuste (%), Orçado, Realizado, Estimado, Barra de utilização
- Ajuste (%) é clicável — abre modal de edição rápida

### 4.5 Tela: Edição Interativa

**Rota:** `/scenarios/:id/edit`

**Layout em 3 colunas:**

```
┌──────────────┬──────────────────────┬──────────────┐
│ Árvore de    │  Itens da categoria  │  Detalhe do  │
│ categorias   │  selecionada         │  item        │
│              │  (edição inline)     │  selecionado │
│ ▼ Despesas   │                      │              │
│   ▼ Pessoal  │  Item 1  [___] [___] │  Nome: ...   │
│     Salários │  Item 2  [___] [___] │  Orçado: ... │
│     Férias   │  Item 3  [___] [___] │  Real.: ...  │
│   ▶ Admin    │                      │  Ajuste: ... │
│ ▶ Receitas   │  [+ Novo Item]       │  [Salvar]    │
└──────────────┴──────────────────────┴──────────────┘
```

**Painel esquerdo — Árvore de categorias:**
- Abas: Despesas / Receitas
- Árvore colapsável com setas ▶/▼
- Contagem de itens por categoria
- Busca por nome de categoria
- Click seleciona categoria e carrega itens no painel central

**Painel central — Itens:**
- Lista de itens da categoria selecionada
- Edição inline: campos de Orçado, Realizado e Provisionado editáveis diretamente
- Botão salvar por linha
- Botão excluir por linha
- Busca por nome de item
- Botão "Adicionar Item"

**Painel direito — Detalhe do item:**
- Exibe todos os campos do item selecionado
- Formulário completo de edição
- Botões Salvar / Cancelar

### 4.6 Tela: Análise de Viabilidade

**Rota:** `/scenarios/:id/analysis`

**Layout em seções:**

**Seção 1 — Alerta de Status:**
- Card de alerta colorido:
  - Vermelho: "Orçamento em Déficit" (despesas > receitas)
  - Verde: "Orçamento Equilibrado" (receitas >= despesas)

**Seção 2 — Cards de Resumo Financeiro (4 cards):**

Cada card mostra 4 linhas temporais:

| Linha | Receitas | Despesas | Saldo |
|-------|----------|----------|-------|
| Orçado (ano base) | R$ X | R$ Y | R$ Z |
| Realizado (ano base) | R$ X | R$ Y | R$ Z |
| Estimado (próximo ano) | R$ X | R$ Y | R$ Z |
| Ideal (próximo ano) | R$ X | R$ Y | R$ Z |

**Seção 3 — Itens Opcionais:**
- Lista de itens marcados como `is_optional = true`
- Cada item com:
  - Nome, Categoria, Tipo (Receita/Despesa), Valor Estimado (R$)
  - Checkbox para incluir/excluir do cálculo
- Ao marcar/desmarcar, todos os totais e simulações são recalculados em tempo real
- Estado dos checkboxes é salvo localmente (localStorage)

**Seção 4 — Correções Percentuais:**
- Card "Correção Prevista": `((estimado - orçado) / orçado) × 100`
- Card "Correção Ideal": `((despesas_ideais - despesas_orçadas) / despesas_orçadas) × 100`

**Seção 5 — Simulação de Taxa de Manutenção:**

Para cada um dos 3 tamanhos de lote configurados em parâmetros:

| Cenário | Taxa Mensal (s/ desconto) | Taxa Mensal (c/ habite-se) |
|---------|--------------------------|---------------------------|
| Ano Base (orçado) | R$ X | R$ Y |
| Previsto (estimado) | R$ X | R$ Y |
| Ideal | R$ X | R$ Y |

**Fórmula:**
```
taxa_por_m2 = total_receitas / total_square_meters
taxa_mensal = (taxa_por_m2 × tamanho_lote) / 12
taxa_com_desconto = taxa_mensal × (1 - habite_se_discount / 100)
```

### 4.7 Tela: Gerenciamento de Categorias

**Rota:** `/categories`

**Layout:**
- Dropdown para selecionar cenário orçamentário
- Duas abas: Despesas / Receitas
- Botões: Expandir Tudo / Recolher Tudo / Adicionar Categoria

**Árvore de Categorias:**
Para cada categoria, exibe:
- Seta de expandir/colapsar (▶/▼)
- Ícone (📂 pai / 📄 folha)
- Nome da categoria
- Contagem de itens entre parênteses
- Badge com percentual de ajuste (clicável para edição rápida)
- Botões: mover para cima (↑), mover para baixo (↓), editar (✏️), excluir (🗑️)

**Modal: Criar/Editar Categoria:**
- Campos:
  - Nome (texto, obrigatório)
  - Descrição (textarea, opcional)
  - Tipo: Despesa / Receita (radio buttons)
  - Categoria pai: dropdown filtrado pelo tipo selecionado (opção "Raiz" para nível superior)
  - Percentual de ajuste padrão (numérico, opcional)
- Botões: Salvar / Cancelar

**Regras de interface:**
- Reordenação por botões ↑/↓ (swap de `order` entre irmãos)
- Exclusão bloqueada com aviso se categoria tem subcategorias ou itens
- Badge de ajuste (%) com cor indicativa

### 4.8 Tela: Parâmetros do Condomínio

**Rota:** `/parameters`

**Layout em seções:**

**Seção 1 — Metragem do Condomínio:**
- Campo: Área total (m²) — numérico com decimais

**Seção 2 — Descontos:**
- Campo: Desconto habite-se (%) — numérico, 0-100, default 10

**Seção 3 — Simulações de Lotes:**
- Campo: Lote simulação 1 (m²) — "Lote pequeno"
- Campo: Lote simulação 2 (m²) — "Lote médio"
- Campo: Lote simulação 3 (m²) — "Lote grande"

**Botão:** Salvar Parâmetros

**Validações:**
- Todos os campos são numéricos com `step="0.01"`
- Valores mínimos: 0
- Desconto máximo: 100%

### 4.9 Tela: Backup e Restauração

**Rota:** `/backup`

**Layout em seções:**

**Seção 1 — Estatísticas do Banco:**
- Grid com 4 cards:
  - Tamanho do banco (MB)
  - Total de registros
  - Total de cenários
  - Total de itens

**Seção 2 — Exportar Dados:**
- Texto explicativo
- Botão "Exportar Dados (JSON)"
- Abre diálogo nativo do sistema operacional para escolher local de salvamento
- Exporta arquivo `.json` com toda a estrutura de dados

**Seção 3 — Importar Dados:**
- Alerta de aviso: "Importar dados substituirá TODOS os dados atuais"
- Botão "Importar Dados (JSON)"
- Abre diálogo nativo do sistema operacional para selecionar arquivo `.json`
- Confirmação antes de executar
- Validação do schema JSON antes de importar
- Cria backup automático do banco atual antes de sobrescrever

---

## 5. Regras de Negócio e Cálculos

### 5.1 Cálculo do Valor Estimado

O valor estimado para o próximo período é calculado hierarquicamente:

```
SE value.estimated_fixed NÃO É NULL:
    estimado = value.estimated_fixed

SENÃO SE item.repeats_next_budget = true:
    estimado = 0

SENÃO:
    ajuste_efetivo = obter_ajuste_efetivo(item)
    estimado = value.budgeted × (1 + (ajuste_efetivo + scenario.risk_margin) / 100)
```

### 5.2 Hierarquia de Percentual de Ajuste Efetivo

O sistema busca o percentual de ajuste na seguinte ordem de prioridade (primeiro não-null vence):

```
1. item.adjustment_percent           (ajuste específico do item)
2. category.adjustment_percent       (ajuste da categoria imediata)
3. parent_category.adjustment_percent (ajuste da categoria pai — recursivo)
4. scenario.general_adjustment       (ajuste geral do cenário)
5. 0.0                               (fallback)
```

### 5.3 Cálculo de Variância

```
variancia = realized - budgeted
variancia_percentual = ((realized - budgeted) / budgeted) × 100
```

Apenas calculada quando `realized` não é null e `budgeted > 0`.

### 5.4 Percentual de Utilização

```
utilizado = (realized / budgeted) × 100
```

**Faixas visuais:**
- Verde: < 75%
- Laranja: 75% a 90%
- Vermelho: > 90%

### 5.5 Cálculo de Totais por Categoria (Recursivo)

```
total_categoria = soma(valores dos itens diretos) + soma(totais das subcategorias)
```

Aplica-se a: `total_budgeted`, `total_realized`, `total_adjusted`, `total_estimated`.

### 5.6 Cálculo de Resumo do Cenário

```
total_despesas = soma(totais das categorias raiz com item_type = EXPENSE)
total_receitas = soma(totais das categorias raiz com item_type = REVENUE)
saldo = total_receitas - total_despesas
```

Calculado para todas as colunas: orçado, realizado, estimado.

### 5.7 Simulação de Taxa de Manutenção

```
taxa_por_m2 = total_receitas / total_square_meters
taxa_anual_lote = taxa_por_m2 × tamanho_lote
taxa_mensal = taxa_anual_lote / 12
taxa_com_desconto = taxa_mensal × (1 - habite_se_discount / 100)
```

Calculada para 3 cenários (orçado, estimado, ideal) × 3 tamanhos de lote.

### 5.8 Correção Percentual

```
correcao_prevista = ((total_estimado - total_orcado) / total_orcado) × 100
correcao_ideal = ((despesas_ideais - despesas_orcadas) / despesas_orcadas) × 100
```

### 5.9 Simulação de Ajustes (Criação de Cenário Simulado)

Ao criar uma simulação a partir de um cenário base:

```
PARA CADA item DO cenário base:
    SE existe ajuste específico para o item:
        usar ajuste do item (percentual ou valor customizado)
    SENÃO SE existe ajuste para a categoria do item:
        usar ajuste da categoria
    SENÃO:
        usar ajuste geral da simulação

    valor_ajustado = valor_base × (1 + ajuste / 100)

    SE risk_margin > 0:
        valor_ajustado = valor_ajustado × (1 + risk_margin / 100)
```

### 5.10 Comparação de Cenários

Compara dois cenários mapeando categorias e itens por nome:

```
PARA CADA categoria/item correspondente:
    diferença = valor_comparado - valor_base
    diferença_percentual = (diferença / valor_base) × 100
```

Retorna totais de despesas, receitas e saldo para ambos os cenários.

---

## 6. Fluxos de Uso

### 6.1 Fluxo Principal: Criar Orçamento do Ano

```
1. Abrir app
2. Clicar "Novo Orçamento"
3. Preencher nome, ano, tipo base:
   a. "Copiar ano anterior" → copia estrutura e valores do cenário baseline
   b. "Do zero" → cenário vazio, criar categorias manualmente
4. Sistema inicializa categorias raiz (DESPESAS e RECEITAS)
5. Navegar para "Categorias" → criar subcategorias
6. Navegar para "Detalhes do cenário" ou "Edição interativa"
7. Preencher/ajustar valores (orçado, realizado, ajuste %)
8. Configurar parâmetros do condomínio (m², lotes, habite-se)
9. Consultar "Resumo" para ver gráficos e totais
10. Consultar "Análise" para verificar viabilidade e simular taxas
11. Gerar PDF para apresentação em assembleia
12. Aprovar e fechar o cenário final
```

### 6.2 Fluxo de Simulação

```
1. A partir de um cenário existente, clicar "Simular"
2. Definir ajustes:
   - Ajuste geral (%) → aplica a todos os itens
   - Ajustes por categoria (%) → sobrescreve geral para a categoria
   - Ajustes por item (% ou valor fixo) → sobrescreve categoria
   - Margem de risco (%) → adicional sobre todos os ajustes
3. Sistema cria novo cenário com valores recalculados
4. Comparar cenário simulado com o original
```

### 6.3 Fluxo de Comparação

```
1. Na lista de cenários, selecionar dois cenários
2. Sistema exibe comparação lado-a-lado:
   - Totais de despesas (base vs. comparado)
   - Totais de receitas (base vs. comparado)
   - Saldo (base vs. comparado)
   - Diferenças por categoria e item (valor e %)
```

### 6.4 Fluxo de Exportar/Importar

```
Exportar:
1. Ir para "Backup"
2. Clicar "Exportar Dados (JSON)"
3. Escolher local no sistema de arquivos (diálogo nativo)
4. Arquivo .json é salvo

Importar:
1. Ir para "Backup"
2. Clicar "Importar Dados (JSON)"
3. Selecionar arquivo .json (diálogo nativo)
4. Sistema valida schema do JSON
5. Sistema cria backup automático do banco atual
6. Confirmar importação
7. Dados são substituídos
```

---

## 7. Formato de Export/Import (JSON)

### 7.1 Estrutura do Arquivo JSON

```json
{
  "version": "1.0",
  "exported_at": "2026-04-18T10:30:00Z",
  "app_version": "1.0.0",
  "parameters": {
    "total_square_meters": 150000.0,
    "lot_simulation_1": 250.0,
    "lot_simulation_2": 450.0,
    "lot_simulation_3": 800.0,
    "habite_se_discount": 10.0
  },
  "scenarios": [
    {
      "name": "Orçamento 2026",
      "description": "Orçamento aprovado para 2026",
      "year": 2026,
      "is_baseline": true,
      "is_approved": true,
      "is_closed": true,
      "general_adjustment": 7.5,
      "risk_margin": 2.0,
      "created_at": "2025-10-12T00:00:00Z",
      "categories": [
        {
          "name": "DESPESAS GERAIS COM PESSOAL",
          "code": "01",
          "item_type": "expense",
          "order": 1,
          "adjustment_percent": null,
          "subcategories": [
            {
              "name": "TOTAL SALÁRIOS E ENCARGOS",
              "code": "01.01",
              "order": 1,
              "adjustment_percent": null,
              "items": [
                {
                  "name": "Salários / Adicionais / Horas Extras",
                  "order": 1,
                  "adjustment_percent": null,
                  "repeats_next_budget": false,
                  "is_optional": false,
                  "observations": null,
                  "values": {
                    "budgeted": 710000.0,
                    "realized": 608756.22,
                    "adjusted": 850000.0,
                    "estimated_fixed": null,
                    "notes": null
                  }
                }
              ]
            }
          ],
          "items": []
        }
      ]
    }
  ]
}
```

### 7.2 Regras de Validação na Importação

- Campo `version` deve ser compatível com a versão do app
- Todos os campos obrigatórios devem estar presentes
- `item_type` deve ser "expense" ou "revenue"
- Subcategorias herdam `item_type` da categoria pai
- Valores numéricos devem ser válidos (não-negativos onde aplicável)
- `habite_se_discount` deve estar entre 0 e 100

---

## 8. Geração de PDF

### 8.1 Layout do PDF

**Formato:** A4 paisagem (landscape)
**Estilo:** Profissional e moderno, com cores e tipografia limpa

### 8.2 Conteúdo do PDF

**Página 1+ — Detalhamento de Despesas:**

Cabeçalho:
- Título: "Orçamento — {nome do cenário}"
- Informações: Ano, Ajuste Geral, Margem de Risco, Data de geração

Tabela hierárquica com colunas:
| Nº | Descrição | Orçado (R$) | Realizado (R$) | Total (R$) | Utilizado (%) | Aumento+Margem (%) | Estimado (R$) |

- Categorias em negrito com fundo de destaque
- Subcategorias com indentação e fundo mais claro
- Itens com indentação dupla
- Indicadores visuais: ⭐ (opcional), 🚫 (não-repete)
- Subtotais por categoria e subcategoria

**Página seguinte — Detalhamento de Receitas:**
- Mesma estrutura das despesas

**Página seguinte — Sumário Executivo:**

Tabela resumo:
| | Orçado (Ano Base) | Realizado (Ano Base) | Previsto (Próx. Ano) | Ideal (Próx. Ano) |
|----------|-------------------|----------------------|----------------------|--------------------|
| Receitas | R$ X | R$ X | R$ X | R$ X |
| Despesas | R$ X | R$ X | R$ X | R$ X |
| Saldo | R$ X | R$ X | R$ X | R$ X |

Linhas adicionais:
- Correção Prevista (%)
- Correção Ideal (%)

**Seção — Simulação de Taxas de Manutenção:**
(Apenas se parâmetros de m² estão configurados)

Para cada tamanho de lote (1, 2, 3):
| Cenário | Taxa Mensal | Taxa c/ Habite-se |
|---------|-------------|-------------------|
| Base | R$ X | R$ X |
| Previsto | R$ X | R$ X |
| Ideal | R$ X | R$ X |

---

## 9. Formatação e Localização

### 9.1 Formato Monetário

- Padrão: Real Brasileiro (BRL)
- Formato: `R$ 1.234.567,89`
- Separador de milhar: ponto (.)
- Separador decimal: vírgula (,)
- Símbolo: R$
- Valores negativos: `-R$ 1.234,56` ou em vermelho

### 9.2 Formato Percentual

- Formato: `12,34%`
- Separador decimal: vírgula (,)

### 9.3 Formato de Data

- Formato: `DD/MM/AAAA HH:MM`
- Exemplo: `18/04/2026 10:30`
- Locale: pt-BR

### 9.4 Idioma

- Interface 100% em Português do Brasil
- Mensagens de erro em português
- Labels, tooltips, placeholders em português

---

## 10. Comportamento Desktop

### 10.1 Características Nativas

- **Diálogos de arquivo**: Usar diálogos nativos do SO para salvar/abrir arquivos (PDF, JSON)
- **Barra de título**: Título do app com nome do cenário ativo
- **Sidebar fixa**: Navegação estilo app desktop (não web)
- **Atalhos de teclado**: Ctrl+S para salvar, Ctrl+N para novo, Esc para fechar modal
- **Sem animações excessivas**: Transições sutis, comportamento imediato
- **Tamanho de janela**: Mínimo 1024×768, responsivo até telas maiores

### 10.2 Persistência Local

- **Banco de dados**: SQLite em diretório de dados do app (`AppData` no Windows, `Application Support` no macOS, `~/.local/share` no Linux)
- **Preferências de UI**: Estado de categorias expandidas/colapsadas, itens opcionais marcados, último cenário aberto — em localStorage do WebView
- **Backups automáticos**: Antes de cada importação, salvo no mesmo diretório de dados

---

## 11. Decisões de Design Excluídas

As seguintes funcionalidades do sistema original foram **removidas** desta especificação:

| Funcionalidade | Motivo da Remoção |
|---------------|-------------------|
| Autenticação (login/JWT) | App stand-alone sem compartilhamento |
| Gerenciamento de usuários | Uso individual, sem perfis |
| Análise Monte Carlo | Complexidade desnecessária para o uso real |
| Cálculo de orçamento ideal automático | Simplificação — usuário ajusta manualmente |
| Importação de Excel | Dados entram manualmente ou por cópia de cenário |
| API REST/HTTP | Comunicação via IPC do Tauri (mais eficiente) |
| Deploy via Docker | App desktop nativo com instalador |

---

## 12. Categorias Padrão (Template Condominial)

Ao criar um cenário "do zero" e inicializar categorias, as seguintes categorias raiz e subcategorias padrão são sugeridas (o usuário pode aceitar ou customizar):

### Despesas:
1. **DESPESAS GERAIS COM PESSOAL — ADM/MANUTENÇÃO**
   - Total Salários e Encargos
   - Total Férias e Encargos
   - Total 13.º Salário e Encargos
   - Provisões Trabalhistas
   - Benefícios
2. **OUTRAS DESPESAS ADMINISTRATIVAS**
3. **SERVIÇOS DE TERCEIROS**
4. **MANUTENÇÃO ÁREAS COMUNS**
5. **SEGURANÇA**
6. **DESPESAS COM VEÍCULOS**
7. **EVENTOS SOCIAIS/ESPORTIVOS**
8. **INVESTIMENTOS**
9. **IMPOSTOS, TAXAS E CONTRIBUIÇÕES**
10. **DESPESAS FINANCEIRAS**

### Receitas:
1. **TAXA DE MANUTENÇÃO — FATURAMENTO**
2. **RECEITAS FINANCEIRAS DIVERSAS**

---

## 13. Requisitos Não-Funcionais

| Requisito | Especificação |
|-----------|---------------|
| Plataformas | Windows 10+, macOS 12+, Linux (Ubuntu 22.04+) |
| Tamanho do instalador | < 20 MB (meta do Tauri) |
| Tempo de inicialização | < 2 segundos |
| Performance de cálculos | Resumo de cenário com 500 itens em < 100ms |
| Banco de dados | Suporte a bancos de até 50 MB sem degradação |
| Idioma | Português do Brasil (pt-BR) |
| Acessibilidade | Navegação por teclado, contraste adequado |
| Instalação | Instalador nativo por plataforma (.msi, .dmg, .AppImage) |
