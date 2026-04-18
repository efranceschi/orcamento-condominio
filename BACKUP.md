# Especificação do Formato de Backup

Este documento descreve o formato JSON utilizado para exportar e importar dados da **Calculadora Orçamentária**. O formato é aberto e pode ser gerado por ferramentas externas, planilhas ou agentes de IA para alimentar o sistema.

## Visão Geral

O arquivo de backup é um documento JSON com extensão `.json` contendo 5 seções:

```json
{
  "version": "1.0",
  "exported_at": "2026-04-18 15:30:00",
  "scenarios": [],
  "categories": [],
  "items": [],
  "values": [],
  "parameters": {}
}
```

**Codificação:** UTF-8

**Importação:** Ao importar, todos os dados existentes no sistema são substituídos. A operação é atômica — se qualquer parte falhar, nenhuma alteração é aplicada.

---

## Campos do Envelope

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `version` | string | Sim | Versão do formato. Atualmente `"1.0"` |
| `exported_at` | string | Sim | Data/hora da exportação. Formato: `"AAAA-MM-DD HH:MM:SS"` |
| `scenarios` | array | Sim | Lista de cenários orçamentários |
| `categories` | array | Sim | Lista de categorias (flat, não aninhada) |
| `items` | array | Sim | Lista de itens orçamentários |
| `values` | array | Sim | Lista de valores financeiros |
| `parameters` | object | Sim | Parâmetros do condomínio (registro único) |

---

## 1. Cenários (`scenarios`)

Cada cenário representa uma proposta ou versão do orçamento anual.

### Campos

| Campo | Tipo | Obrigatório | Default | Domínio | Descrição |
|-------|------|-------------|---------|---------|-----------|
| `id` | integer | Sim | — | > 0, único | Identificador do cenário |
| `name` | string | Sim | — | 1-200 caracteres | Nome do cenário |
| `description` | string \| null | Não | `null` | Texto livre | Descrição do cenário |
| `year` | integer | Sim | — | 2000-2100 | Ano de referência do orçamento |
| `base_scenario_id` | integer \| null | Não | `null` | ID de outro cenário, ou `null` | Cenário de origem (se for cópia ou simulação) |
| `is_baseline` | boolean | Sim | `false` | `true` / `false` | Se é o orçamento realizado (base de comparação) |
| `is_approved` | boolean | Sim | `false` | `true` / `false` | Se foi aprovado em assembleia |
| `is_closed` | boolean | Sim | `false` | `true` / `false` | Se está fechado para edição |
| `general_adjustment` | number | Sim | `0.0` | -100.0 a 100.0 | Percentual de reajuste geral (%) |
| `risk_margin` | number | Sim | `0.0` | 0.0 a 100.0 | Margem de risco adicional (%) |
| `created_at` | string \| null | Não | Auto | `"AAAA-MM-DD HH:MM:SS"` | Data de criação |
| `updated_at` | string \| null | Não | Auto | `"AAAA-MM-DD HH:MM:SS"` | Última atualização |

### Exemplo

```json
{
  "id": 1,
  "name": "Orçamento 2026",
  "description": "Proposta orçamentária aprovada para 2026",
  "year": 2026,
  "base_scenario_id": null,
  "is_baseline": true,
  "is_approved": true,
  "is_closed": false,
  "general_adjustment": 7.5,
  "risk_margin": 2.0,
  "created_at": "2026-01-15 10:00:00",
  "updated_at": "2026-03-20 14:30:00"
}
```

### Regras

- `id` deve ser único entre todos os cenários.
- `base_scenario_id`, se informado, deve referenciar um `id` presente na lista de cenários.
- Um cenário com `is_baseline: true` é tratado como o orçamento realizado do ano.
- `general_adjustment` serve como percentual de fallback quando categorias e itens não possuem ajuste próprio.

---

## 2. Categorias (`categories`)

Categorias organizam despesas e receitas em uma hierarquia de árvore. A lista é **flat** (não aninhada) — o relacionamento pai-filho é definido por `parent_category_id`.

### Campos

| Campo | Tipo | Obrigatório | Default | Domínio | Descrição |
|-------|------|-------------|---------|---------|-----------|
| `id` | integer | Sim | — | > 0, único | Identificador da categoria |
| `scenario_id` | integer | Sim | — | ID de um cenário | Cenário ao qual pertence |
| `parent_category_id` | integer \| null | Não | `null` | ID de outra categoria, ou `null` | Categoria pai. `null` = categoria raiz |
| `name` | string | Sim | — | 1-200 caracteres | Nome da categoria |
| `description` | string \| null | Não | `null` | Texto livre | Descrição |
| `code` | string \| null | Não | `null` | Ex: `"01"`, `"01.02"`, `"R01"` | Código hierárquico para ordenação visual |
| `item_type` | string | Sim | — | `"expense"` ou `"revenue"` | Tipo: despesa ou receita |
| `order` | integer | Sim | `0` | >= 0 | Ordem de exibição entre irmãos |
| `adjustment_percent` | number \| null | Não | `null` | -100.0 a 100.0 | Percentual de reajuste da categoria (%) |
| `created_at` | string \| null | Não | Auto | `"AAAA-MM-DD HH:MM:SS"` | Data de criação |
| `updated_at` | string \| null | Não | Auto | `"AAAA-MM-DD HH:MM:SS"` | Última atualização |

### Exemplo — Categoria raiz

```json
{
  "id": 1,
  "scenario_id": 1,
  "parent_category_id": null,
  "name": "DESPESAS",
  "description": null,
  "code": "D",
  "item_type": "expense",
  "order": 1,
  "adjustment_percent": null,
  "created_at": "2026-01-15 10:00:00",
  "updated_at": "2026-01-15 10:00:00"
}
```

### Exemplo — Subcategoria

```json
{
  "id": 3,
  "scenario_id": 1,
  "parent_category_id": 1,
  "name": "DESPESAS GERAIS COM PESSOAL",
  "description": null,
  "code": "01",
  "item_type": "expense",
  "order": 1,
  "adjustment_percent": 8.5,
  "created_at": "2026-01-15 10:00:00",
  "updated_at": "2026-01-15 10:00:00"
}
```

### Regras

- `id` deve ser único entre todas as categorias.
- `scenario_id` deve referenciar um `id` presente em `scenarios`.
- `parent_category_id` deve referenciar um `id` presente em `categories`, ou ser `null` para raiz.
- Subcategorias **devem** ter o mesmo `item_type` da categoria pai.
- Cada cenário tipicamente possui duas categorias raiz: uma com `item_type: "expense"` e outra com `item_type: "revenue"`.
- `order` define a sequência de exibição entre categorias irmãs (mesmo `parent_category_id`).
- Hierarquias podem ter profundidade arbitrária (categoria raiz → subcategoria → sub-subcategoria).

---

## 3. Itens (`items`)

Itens são as linhas individuais dentro de cada categoria, representando uma despesa ou receita específica.

### Campos

| Campo | Tipo | Obrigatório | Default | Domínio | Descrição |
|-------|------|-------------|---------|---------|-----------|
| `id` | integer | Sim | — | > 0, único | Identificador do item |
| `category_id` | integer | Sim | — | ID de uma categoria | Categoria à qual pertence |
| `name` | string | Sim | — | 1-200 caracteres | Nome do item |
| `description` | string \| null | Não | `null` | Texto livre | Descrição detalhada |
| `unit` | string \| null | Não | `null` | Ex: `"mês"`, `"unidade"` | Unidade de medida |
| `order` | integer | Sim | `0` | >= 0 | Ordem de exibição na categoria |
| `adjustment_percent` | number \| null | Não | `null` | -100.0 a 100.0 | Percentual de reajuste específico do item (%) |
| `repeats_next_budget` | boolean | Sim | `false` | `true` / `false` | Se o item **não** se repete no próximo orçamento |
| `is_optional` | boolean | Sim | `false` | `true` / `false` | Se é um item opcional (incluível/excluível na análise) |
| `observations` | string \| null | Não | `null` | Texto livre | Observações sobre o item |

### Exemplo

```json
{
  "id": 10,
  "category_id": 4,
  "name": "Energia Elétrica",
  "description": "Consumo de energia das áreas comuns",
  "unit": null,
  "order": 5,
  "adjustment_percent": 12.0,
  "repeats_next_budget": false,
  "is_optional": false,
  "observations": "Contrato renovado até dez/2026"
}
```

### Exemplo — Item que não se repete

```json
{
  "id": 25,
  "category_id": 8,
  "name": "Reforma do Salão de Festas",
  "description": null,
  "unit": null,
  "order": 1,
  "adjustment_percent": null,
  "repeats_next_budget": true,
  "is_optional": true,
  "observations": "Obra pontual aprovada em AGE"
}
```

### Regras

- `id` deve ser único entre todos os itens.
- `category_id` deve referenciar um `id` presente em `categories`.
- Quando `repeats_next_budget` é `true`, o valor estimado para o próximo período será zero (item pontual).
- Quando `is_optional` é `true`, o item pode ser incluído ou excluído dos cálculos de análise de viabilidade pela interface.
- `adjustment_percent` no item tem prioridade máxima na hierarquia de ajuste (ver seção Cálculos).

---

## 4. Valores (`values`)

Cada registro de valor contém os dados financeiros de um item. Um item possui tipicamente um registro de valor.

### Campos

| Campo | Tipo | Obrigatório | Default | Domínio | Descrição |
|-------|------|-------------|---------|---------|-----------|
| `id` | integer | Sim | — | > 0, único | Identificador do valor |
| `item_id` | integer | Sim | — | ID de um item | Item ao qual pertence |
| `budgeted` | number | Sim | `0.0` | >= 0.0 | Valor orçado em reais (R$) |
| `realized` | number \| null | Não | `null` | >= 0.0 | Valor realizado/executado em reais (R$) |
| `adjusted` | number \| null | Não | `null` | >= 0.0 | Valor proposto/ajustado para o próximo período (R$) |
| `estimated_fixed` | number \| null | Não | `null` | >= 0.0 | Valor estimado fixo — sobrescreve o cálculo automático |
| `adjustment_percent` | number \| null | Não | `null` | -100.0 a 100.0 | Percentual de ajuste específico deste valor (%) |
| `custom_adjustment` | number \| null | Não | `null` | Qualquer número | Ajuste customizado em valor absoluto (R$) |
| `notes` | string \| null | Não | `null` | Texto livre | Notas sobre o valor |
| `created_at` | string \| null | Não | Auto | `"AAAA-MM-DD HH:MM:SS"` | Data de criação |
| `updated_at` | string \| null | Não | Auto | `"AAAA-MM-DD HH:MM:SS"` | Última atualização |

### Exemplo — Valor com orçado e realizado

```json
{
  "id": 10,
  "item_id": 10,
  "budgeted": 470000.00,
  "realized": 350422.51,
  "adjusted": 470000.00,
  "estimated_fixed": null,
  "adjustment_percent": null,
  "custom_adjustment": null,
  "notes": null,
  "created_at": "2026-01-15 10:00:00",
  "updated_at": "2026-06-30 08:00:00"
}
```

### Exemplo — Valor com estimado fixo

```json
{
  "id": 42,
  "item_id": 25,
  "budgeted": 235000.00,
  "realized": 198765.43,
  "adjusted": 250000.00,
  "estimated_fixed": 300000.00,
  "adjustment_percent": null,
  "custom_adjustment": null,
  "notes": "Valor fixado conforme orçamento da construtora",
  "created_at": "2026-01-15 10:00:00",
  "updated_at": "2026-01-15 10:00:00"
}
```

### Regras

- `id` deve ser único entre todos os valores.
- `item_id` deve referenciar um `id` presente em `items`.
- `budgeted` é o único campo financeiro obrigatório. Os demais podem ser `null`.
- `realized` representa o valor efetivamente gasto/recebido. Quando `null`, não há dado de execução.
- Se `estimated_fixed` estiver preenchido, ele sobrescreve o cálculo automático do valor estimado.
- Valores monetários são em reais (R$), com precisão de centavos (2 casas decimais).

---

## 5. Parâmetros (`parameters`)

Registro único com configurações globais do condomínio, utilizadas nas simulações de taxa de manutenção.

### Campos

| Campo | Tipo | Obrigatório | Default | Domínio | Descrição |
|-------|------|-------------|---------|---------|-----------|
| `id` | integer | Não | `1` | Sempre `1` | Identificador fixo |
| `total_square_meters` | number | Sim | `0.0` | >= 0.0 | Área total do condomínio em m² |
| `lot_simulation_1` | number | Sim | `0.0` | >= 0.0 | Tamanho do lote para simulação 1 (m²) — lote pequeno |
| `lot_simulation_2` | number | Sim | `0.0` | >= 0.0 | Tamanho do lote para simulação 2 (m²) — lote médio |
| `lot_simulation_3` | number | Sim | `0.0` | >= 0.0 | Tamanho do lote para simulação 3 (m²) — lote grande |
| `habite_se_discount` | number | Sim | `10.0` | 0.0 a 100.0 | Desconto concedido a lotes com habite-se (%) |

### Exemplo

```json
{
  "id": 1,
  "total_square_meters": 150000.0,
  "lot_simulation_1": 250.0,
  "lot_simulation_2": 450.0,
  "lot_simulation_3": 800.0,
  "habite_se_discount": 10.0
}
```

### Regras

- Existe sempre exatamente um registro de parâmetros.
- `total_square_meters` é a metragem total do condomínio, usada como divisor no cálculo da taxa por m².
- As simulações de lotes representam tamanhos de terrenos típicos (pequeno, médio, grande) para estimar a taxa mensal individual.
- `habite_se_discount` é o percentual de desconto aplicado à taxa de manutenção para lotes que possuem habite-se.

---

## Relacionamentos entre Entidades

```
scenarios
  └── categories (via scenario_id)
        └── categories (via parent_category_id — auto-referência)
        └── items (via category_id)
              └── values (via item_id)

parameters (registro único, independente)
```

**Integridade referencial:**
- Todo `category.scenario_id` deve existir em `scenarios[].id`
- Todo `category.parent_category_id` (quando não-null) deve existir em `categories[].id`
- Todo `item.category_id` deve existir em `categories[].id`
- Todo `value.item_id` deve existir em `items[].id`

---

## Hierarquia de Ajuste Percentual

O sistema calcula o percentual de ajuste efetivo para cada item seguindo esta ordem de prioridade (o primeiro valor não-null vence):

1. `items[].adjustment_percent` — ajuste específico do item
2. `categories[].adjustment_percent` — ajuste da categoria imediata do item
3. `categories[].adjustment_percent` da categoria pai (recursivo até a raiz)
4. `scenarios[].general_adjustment` — ajuste geral do cenário
5. `0.0` — fallback

---

## Cálculo do Valor Estimado

O valor estimado para o próximo período é calculado automaticamente:

```
SE value.estimated_fixed NÃO É NULL:
    estimado = value.estimated_fixed

SENÃO SE item.repeats_next_budget = true:
    estimado = 0

SENÃO:
    ajuste_efetivo = (hierarquia de ajuste acima)
    estimado = value.budgeted × (1 + (ajuste_efetivo + scenario.risk_margin) / 100)
```

**Exemplo:** `budgeted = 100000`, `ajuste_efetivo = 7.5`, `risk_margin = 2.0`:
```
estimado = 100000 × (1 + (7.5 + 2.0) / 100) = 100000 × 1.095 = 109500
```

---

## Cálculo da Taxa de Manutenção

Quando `parameters.total_square_meters > 0`:

```
taxa_por_m2 = total_receitas / total_square_meters
taxa_mensal = (taxa_por_m2 × tamanho_lote) / 12
taxa_com_desconto = taxa_mensal × (1 - habite_se_discount / 100)
```

---

## Validações na Importação

O sistema verifica as seguintes regras ao importar:

1. O campo `version` deve estar presente e não vazio.
2. Todos os `id` devem ser únicos dentro de sua coleção.
3. Todas as referências (`scenario_id`, `parent_category_id`, `category_id`, `item_id`) devem apontar para registros existentes no arquivo.
4. `item_type` aceita apenas os valores `"expense"` ou `"revenue"`.
5. Subcategorias devem ter o mesmo `item_type` da categoria pai.
6. A importação é atômica: se qualquer validação falhar, nenhum dado é alterado.

---

## Exemplo Mínimo Completo

Um arquivo válido com um cenário, uma categoria de despesa, um item e um valor:

```json
{
  "version": "1.0",
  "exported_at": "2026-04-18 12:00:00",
  "scenarios": [
    {
      "id": 1,
      "name": "Orçamento 2026",
      "description": null,
      "year": 2026,
      "base_scenario_id": null,
      "is_baseline": true,
      "is_approved": false,
      "is_closed": false,
      "general_adjustment": 5.0,
      "risk_margin": 2.0,
      "created_at": "2026-01-01 00:00:00",
      "updated_at": "2026-01-01 00:00:00"
    }
  ],
  "categories": [
    {
      "id": 1,
      "scenario_id": 1,
      "parent_category_id": null,
      "name": "DESPESAS",
      "description": null,
      "code": "D",
      "item_type": "expense",
      "order": 1,
      "adjustment_percent": null,
      "created_at": "2026-01-01 00:00:00",
      "updated_at": "2026-01-01 00:00:00"
    },
    {
      "id": 2,
      "scenario_id": 1,
      "parent_category_id": null,
      "name": "RECEITAS",
      "description": null,
      "code": "R",
      "item_type": "revenue",
      "order": 2,
      "adjustment_percent": null,
      "created_at": "2026-01-01 00:00:00",
      "updated_at": "2026-01-01 00:00:00"
    },
    {
      "id": 3,
      "scenario_id": 1,
      "parent_category_id": 1,
      "name": "Energia e Utilidades",
      "description": null,
      "code": "01",
      "item_type": "expense",
      "order": 1,
      "adjustment_percent": 10.0,
      "created_at": "2026-01-01 00:00:00",
      "updated_at": "2026-01-01 00:00:00"
    }
  ],
  "items": [
    {
      "id": 1,
      "category_id": 3,
      "name": "Energia Elétrica",
      "description": null,
      "unit": null,
      "order": 1,
      "adjustment_percent": null,
      "repeats_next_budget": false,
      "is_optional": false,
      "observations": null
    }
  ],
  "values": [
    {
      "id": 1,
      "item_id": 1,
      "budgeted": 470000.00,
      "realized": 350422.51,
      "adjusted": 470000.00,
      "estimated_fixed": null,
      "adjustment_percent": null,
      "custom_adjustment": null,
      "notes": null,
      "created_at": "2026-01-01 00:00:00",
      "updated_at": "2026-06-30 08:00:00"
    }
  ],
  "parameters": {
    "id": 1,
    "total_square_meters": 150000.0,
    "lot_simulation_1": 250.0,
    "lot_simulation_2": 450.0,
    "lot_simulation_3": 800.0,
    "habite_se_discount": 10.0
  }
}
```
