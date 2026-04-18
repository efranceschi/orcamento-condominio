#!/usr/bin/env python3
"""
Popula o banco de dados do novo app Tauri com os dados do projeto antigo.

Os dados são os mesmos que estavam hardcoded no excel_import.py da versão
Python/FastAPI — representando a "Proposta Orçamentária 2026" do condomínio.

Uso:
    python3 scripts/seed_data.py [caminho_do_banco]

Se o caminho não for informado, tenta encontrar o banco automaticamente:
    - macOS: ~/Library/Application Support/com.orcamento.condominio/orcamento.db
    - Linux: ~/.local/share/com.orcamento.condominio/orcamento.db
"""

import sqlite3
import sys
import os
from pathlib import Path
from datetime import datetime


def find_db_path() -> Path:
    """Encontra o banco de dados do app Tauri."""
    candidates = []

    # macOS
    mac_path = Path.home() / "Library/Application Support/com.orcamento.condominio/orcamento.db"
    candidates.append(mac_path)

    # Linux
    linux_path = Path.home() / ".local/share/com.orcamento.condominio/orcamento.db"
    candidates.append(linux_path)

    # Windows
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        win_path = Path(appdata) / "com.orcamento.condominio/orcamento.db"
        candidates.append(win_path)

    # Local (dev)
    local_path = Path("data/orcamento.db")
    candidates.append(local_path)

    for path in candidates:
        if path.exists():
            return path

    # Se nenhum existe, criar no caminho do macOS (ou do SO atual)
    if sys.platform == "darwin":
        mac_path.parent.mkdir(parents=True, exist_ok=True)
        return mac_path
    elif sys.platform == "linux":
        linux_path.parent.mkdir(parents=True, exist_ok=True)
        return linux_path
    else:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        return local_path


def create_tables(conn: sqlite3.Connection):
    """Cria as tabelas se não existirem."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS budget_scenarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            year INTEGER NOT NULL,
            base_scenario_id INTEGER REFERENCES budget_scenarios(id),
            is_baseline INTEGER NOT NULL DEFAULT 0,
            is_approved INTEGER NOT NULL DEFAULT 0,
            is_closed INTEGER NOT NULL DEFAULT 0,
            general_adjustment REAL NOT NULL DEFAULT 0.0,
            risk_margin REAL NOT NULL DEFAULT 0.0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS budget_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scenario_id INTEGER NOT NULL REFERENCES budget_scenarios(id) ON DELETE CASCADE,
            parent_category_id INTEGER REFERENCES budget_categories(id),
            name TEXT NOT NULL,
            description TEXT,
            code TEXT,
            item_type TEXT NOT NULL CHECK(item_type IN ('expense', 'revenue')),
            "order" INTEGER NOT NULL DEFAULT 0,
            adjustment_percent REAL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS budget_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            unit TEXT,
            "order" INTEGER NOT NULL DEFAULT 0,
            adjustment_percent REAL,
            repeats_next_budget INTEGER NOT NULL DEFAULT 0,
            is_optional INTEGER NOT NULL DEFAULT 0,
            observations TEXT
        );

        CREATE TABLE IF NOT EXISTS budget_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
            budgeted REAL NOT NULL DEFAULT 0.0,
            realized REAL,
            adjusted REAL,
            estimated_fixed REAL,
            adjustment_percent REAL,
            custom_adjustment REAL,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS system_parameters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total_square_meters REAL NOT NULL DEFAULT 0.0,
            lot_simulation_1 REAL NOT NULL DEFAULT 0.0,
            lot_simulation_2 REAL NOT NULL DEFAULT 0.0,
            lot_simulation_3 REAL NOT NULL DEFAULT 0.0,
            habite_se_discount REAL NOT NULL DEFAULT 10.0
        );

        INSERT OR IGNORE INTO system_parameters (id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount)
        VALUES (1, 0.0, 0.0, 0.0, 0.0, 10.0);
    """)


def seed_parameters(conn: sqlite3.Connection):
    """Insere parâmetros do condomínio."""
    conn.execute("""
        UPDATE system_parameters SET
            total_square_meters = 150000.0,
            lot_simulation_1 = 250.0,
            lot_simulation_2 = 450.0,
            lot_simulation_3 = 800.0,
            habite_se_discount = 10.0
        WHERE id = 1
    """)
    print("  ✓ Parâmetros do condomínio configurados")


def create_category(conn, scenario_id, name, code, item_type, order, parent_id=None):
    """Cria uma categoria e retorna o ID."""
    conn.execute(
        'INSERT INTO budget_categories (scenario_id, parent_category_id, name, code, item_type, "order") VALUES (?, ?, ?, ?, ?, ?)',
        (scenario_id, parent_id, name, code, item_type, order)
    )
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def create_item(conn, category_id, name, order, budgeted, realized, adjusted):
    """Cria um item com seus valores."""
    conn.execute(
        'INSERT INTO budget_items (category_id, name, "order") VALUES (?, ?, ?)',
        (category_id, name, order)
    )
    item_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    realized_val = realized if realized and realized > 0 else None
    conn.execute(
        "INSERT INTO budget_values (item_id, budgeted, realized, adjusted) VALUES (?, ?, ?, ?)",
        (item_id, budgeted, realized_val, adjusted)
    )
    return item_id


def seed_scenario(conn: sqlite3.Connection):
    """Insere o cenário orçamentário completo de 2026."""

    # Criar cenário
    conn.execute(
        "INSERT INTO budget_scenarios (name, year, is_baseline, description, general_adjustment, risk_margin) VALUES (?, ?, ?, ?, ?, ?)",
        ("Orçamento 2026", 2026, 1, "Proposta Orçamentária 2026 — importado do projeto anterior", 7.5, 2.0)
    )
    scenario_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    print(f"  ✓ Cenário criado: Orçamento 2026 (id={scenario_id})")

    # Categorias raiz
    root_despesas = create_category(conn, scenario_id, "DESPESAS", "D", "expense", 1)
    root_receitas = create_category(conn, scenario_id, "RECEITAS", "R", "revenue", 2)

    # ==========================================
    # DESPESAS
    # ==========================================

    # 01 - DESPESAS GERAIS COM PESSOAL
    cat_pessoal = create_category(conn, scenario_id, "DESPESAS GERAIS COM PESSOAL - ADM/MANUTENÇÃO", "01", "expense", 1, root_despesas)

    # 01.01 - Salários e encargos
    sub_salarios = create_category(conn, scenario_id, "TOTAL SALÁRIOS E ENCARGOS", "01.01", "expense", 1, cat_pessoal)
    create_item(conn, sub_salarios, "Salários / Adicionais / Horas Extras", 1, 710000, 608756.22, 850000)
    create_item(conn, sub_salarios, "INSS - 25,5%", 2, 182000, 170223.99, 220000)
    create_item(conn, sub_salarios, "FGTS - 8%", 3, 61000, 53559.50, 70000)
    create_item(conn, sub_salarios, "PIS - 1%", 4, 8800, 6666.63, 9000)

    # 01.02 - Férias e encargos
    sub_ferias = create_category(conn, scenario_id, "TOTAL FÉRIAS E ENCARGOS", "01.02", "expense", 2, cat_pessoal)
    create_item(conn, sub_ferias, "Férias - 33,33%", 1, 94000, 76198.40, 95000)
    create_item(conn, sub_ferias, "INSS - 25,5%", 2, 24000, 17955.87, 25000)
    create_item(conn, sub_ferias, "FGTS - 8%", 3, 7500, 5633.28, 8500)
    create_item(conn, sub_ferias, "PIS - 1%", 4, 940, 704.06, 1500)

    # 01.03 - 13º Salário e encargos
    sub_13 = create_category(conn, scenario_id, "TOTAL 13.º SALÁRIO E ENCARGOS", "01.03", "expense", 3, cat_pessoal)
    create_item(conn, sub_13, "13.º Salário", 1, 61000, 54422.33, 75000)
    create_item(conn, sub_13, "INSS - 25,5%", 2, 16500, 13504.79, 20000)
    create_item(conn, sub_13, "FGTS - 8%", 3, 5500, 4236.84, 7000)
    create_item(conn, sub_13, "PIS - 1%", 4, 880, 529.51, 1500)

    # 01.04 - Provisões
    sub_provisoes = create_category(conn, scenario_id, "PROVISÕES TRABALHISTAS", "01.04", "expense", 4, cat_pessoal)
    create_item(conn, sub_provisoes, "Provisões Ações Trabalhistas", 1, 17600, 0, 100000)
    create_item(conn, sub_provisoes, "Exames Médicos", 2, 1650, 0, 2500)

    # 01.05 - Benefícios
    sub_beneficios = create_category(conn, scenario_id, "BENEFÍCIOS", "01.05", "expense", 5, cat_pessoal)
    create_item(conn, sub_beneficios, "Vale Transporte", 1, 12000, 8923.74, 16000)
    create_item(conn, sub_beneficios, "Vale Cesta", 2, 63500, 0, 80000)
    create_item(conn, sub_beneficios, "Vale Refeição", 3, 76000, 0, 92000)
    create_item(conn, sub_beneficios, "Cesta de Natal / VR Natal", 4, 25500, 0, 26000)
    create_item(conn, sub_beneficios, "Assistência Médica / Odontológica", 5, 155000, 144858.27, 210000)
    create_item(conn, sub_beneficios, "Seguro de Vida", 6, 2880, 3240, 1500)
    create_item(conn, sub_beneficios, "Treinamentos/Cursos/Bolsa Educação", 7, 7000, 7375.02, 12000)
    create_item(conn, sub_beneficios, "Uniformes", 8, 14100, 11036.67, 18000)
    create_item(conn, sub_beneficios, "Equipamentos de Proteção Individual", 9, 14100, 0, 18000)

    # 02 - OUTRAS DESPESAS ADMINISTRATIVAS
    cat_admin = create_category(conn, scenario_id, "OUTRAS DESPESAS ADMINISTRATIVAS", "02", "expense", 2, root_despesas)
    create_item(conn, cat_admin, "Cartórios e Emolumentos", 1, 4500, 1077.83, 5000)
    create_item(conn, cat_admin, "Seguro Patrimonial", 2, 6000, 4735.66, 6500)
    create_item(conn, cat_admin, "Publicação (Edital)", 3, 1800, 362, 2500)
    create_item(conn, cat_admin, "Material de Escritório", 4, 5900, 6158.29, 7000)
    create_item(conn, cat_admin, "Material Copa e Cozinha", 5, 29500, 30419.17, 33000)
    create_item(conn, cat_admin, "Despesas com Reuniões / AGO / AGE", 6, 11000, 0, 12000)
    create_item(conn, cat_admin, "Material de Informática", 7, 9400, 0, 20000)
    create_item(conn, cat_admin, "Material Limpeza e Higiene", 8, 29300, 18837.26, 32000)
    create_item(conn, cat_admin, "Água e Esgoto", 9, 53000, 49157.07, 53000)
    create_item(conn, cat_admin, "Telefonia - Fixa e Celular - PABX", 10, 29300, 24958.05, 25000)
    create_item(conn, cat_admin, "Energia Elétrica", 11, 470000, 350422.51, 470000)
    create_item(conn, cat_admin, "Internet / Informática", 12, 82500, 70560.12, 80000)

    # 03 - SERVIÇOS DE TERCEIROS
    cat_terceiros = create_category(conn, scenario_id, "SERVIÇOS DE TERCEIROS", "03", "expense", 3, root_despesas)
    create_item(conn, cat_terceiros, "Assessoria Jurídica", 1, 94000, 73044.73, 100000)
    create_item(conn, cat_terceiros, "Assessoria Contábil", 2, 70500, 60495.76, 75000)
    create_item(conn, cat_terceiros, "Serviços de Engenharia/Arquitetura", 3, 47000, 32121.94, 50000)
    create_item(conn, cat_terceiros, "Serviços de Zeladoria", 4, 141000, 147600, 150000)
    create_item(conn, cat_terceiros, "Limpeza de Caixas d'Água", 5, 5900, 4475, 6000)

    # 04 - MANUTENÇÃO ÁREAS COMUNS
    cat_manutencao = create_category(conn, scenario_id, "MANUTENÇÃO ÁREAS COMUNS", "04", "expense", 4, root_despesas)
    create_item(conn, cat_manutencao, "Manutenção Hidráulica", 1, 35000, 28765.43, 40000)
    create_item(conn, cat_manutencao, "Manutenção Elétrica", 2, 35000, 31245.67, 40000)
    create_item(conn, cat_manutencao, "Manutenção de Elevadores", 3, 82500, 75231.89, 85000)
    create_item(conn, cat_manutencao, "Manutenção de Jardinagem", 4, 23500, 19876.54, 25000)
    create_item(conn, cat_manutencao, "Manutenção de Piscina", 5, 11800, 9543.21, 12000)
    create_item(conn, cat_manutencao, "Outros Serviços de Manutenção", 6, 17600, 14325.78, 20000)

    # 05 - SEGURANÇA
    cat_seguranca = create_category(conn, scenario_id, "SEGURANÇA", "05", "expense", 5, root_despesas)
    create_item(conn, cat_seguranca, "Serviços de Vigilância", 1, 352000, 328765.43, 370000)
    create_item(conn, cat_seguranca, "Monitoramento Eletrônico", 2, 35000, 31234.56, 38000)

    # 06 - DESPESAS COM VEÍCULOS
    cat_veiculos = create_category(conn, scenario_id, "DESPESAS COM VEÍCULOS", "06", "expense", 6, root_despesas)
    create_item(conn, cat_veiculos, "Combustível", 1, 23500, 21345.67, 25000)
    create_item(conn, cat_veiculos, "Manutenção de Veículos", 2, 11800, 9876.54, 12000)
    create_item(conn, cat_veiculos, "IPVA / Licenciamento", 3, 2950, 2845.32, 3000)

    # 07 - EVENTOS SOCIAIS/ESPORTIVOS
    cat_eventos = create_category(conn, scenario_id, "EVENTOS SOCIAIS/ESPORTIVOS", "07", "expense", 7, root_despesas)
    create_item(conn, cat_eventos, "Festas e Eventos", 1, 47000, 38765.43, 50000)
    create_item(conn, cat_eventos, "Material Esportivo", 2, 5900, 4321.56, 6000)

    # 08 - INVESTIMENTOS
    cat_investimentos = create_category(conn, scenario_id, "INVESTIMENTOS", "08", "expense", 8, root_despesas)
    create_item(conn, cat_investimentos, "Obras e Reformas", 1, 235000, 198765.43, 250000)
    create_item(conn, cat_investimentos, "Equipamentos e Mobiliário", 2, 58800, 47654.32, 60000)
    create_item(conn, cat_investimentos, "Infraestrutura Tecnológica", 3, 35000, 28934.56, 40000)

    # 09 - IMPOSTOS, TAXAS E CONTRIBUIÇÕES
    cat_impostos = create_category(conn, scenario_id, "IMPOSTOS, TAXAS E CONTRIBUIÇÕES", "09", "expense", 9, root_despesas)
    create_item(conn, cat_impostos, "IPTU", 1, 117600, 117600, 120000)
    create_item(conn, cat_impostos, "Taxas Municipais", 2, 5900, 5432.10, 6000)

    # 10 - DESPESAS FINANCEIRAS
    cat_financeiras = create_category(conn, scenario_id, "DESPESAS FINANCEIRAS", "10", "expense", 10, root_despesas)
    create_item(conn, cat_financeiras, "Tarifas Bancárias", 1, 11800, 10234.56, 12000)
    create_item(conn, cat_financeiras, "Juros e Multas", 2, 5900, 3456.78, 6000)

    # ==========================================
    # RECEITAS
    # ==========================================

    # R01 - TAXA DE MANUTENÇÃO
    cat_taxa = create_category(conn, scenario_id, "TAXA DE MANUTENÇÃO - FATURAMENTO", "R01", "revenue", 1, root_receitas)
    create_item(conn, cat_taxa, "Taxa Ordinária de Condomínio", 1, 2800000, 2650000, 2900000)
    create_item(conn, cat_taxa, "Taxa Extraordinária", 2, 120000, 95000, 130000)

    # R02 - RECEITAS FINANCEIRAS
    cat_receitas_fin = create_category(conn, scenario_id, "RECEITAS FINANCEIRAS DIVERSAS", "R02", "revenue", 2, root_receitas)
    create_item(conn, cat_receitas_fin, "Rendimentos de Aplicações", 1, 35000, 28765.43, 38000)
    create_item(conn, cat_receitas_fin, "Multas e Juros de Mora", 2, 23500, 19876.54, 25000)
    create_item(conn, cat_receitas_fin, "Outras Receitas", 3, 11800, 8934.56, 12000)

    # Contagem
    cat_count = conn.execute("SELECT COUNT(*) FROM budget_categories WHERE scenario_id = ?", (scenario_id,)).fetchone()[0]
    item_count = conn.execute("""
        SELECT COUNT(*) FROM budget_items i
        JOIN budget_categories c ON i.category_id = c.id
        WHERE c.scenario_id = ?
    """, (scenario_id,)).fetchone()[0]
    value_count = conn.execute("""
        SELECT COUNT(*) FROM budget_values v
        JOIN budget_items i ON v.item_id = i.id
        JOIN budget_categories c ON i.category_id = c.id
        WHERE c.scenario_id = ?
    """, (scenario_id,)).fetchone()[0]

    print(f"  ✓ {cat_count} categorias criadas")
    print(f"  ✓ {item_count} itens criados")
    print(f"  ✓ {value_count} valores inseridos")


def main():
    # Determinar caminho do banco
    if len(sys.argv) > 1:
        db_path = Path(sys.argv[1])
        db_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        db_path = find_db_path()

    print("╔══════════════════════════════════════════╗")
    print("║  Seed de Dados — Calculadora Orçamentária ║")
    print("╚══════════════════════════════════════════╝")
    print()
    print(f"  Banco: {db_path}")
    print()

    # Verificar se já tem dados
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    create_tables(conn)

    existing = conn.execute("SELECT COUNT(*) FROM budget_scenarios").fetchone()[0]
    if existing > 0:
        print(f"  ⚠  O banco já contém {existing} cenário(s).")
        resp = input("  Deseja continuar e adicionar os dados? (s/n): ").strip().lower()
        if resp != "s":
            print("  Cancelado.")
            conn.close()
            return

    print()
    print("Inserindo dados...")
    print()

    seed_parameters(conn)
    seed_scenario(conn)

    conn.commit()
    conn.close()

    print()
    print("✓ Dados inseridos com sucesso!")
    print()
    print("Agora abra o app com ./run.sh para ver os dados.")


if __name__ == "__main__":
    main()
