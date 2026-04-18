use tauri::State;
use crate::db::Database;
use crate::models::category::BudgetCategory;
use crate::models::parameters::SystemParameters;
use crate::models::scenario::BudgetScenario;
use printpdf::*;
use std::io::BufWriter;

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_W: f32 = 297.0; // A4 landscape width in mm
const PAGE_H: f32 = 210.0; // A4 landscape height in mm
const MARGIN_LEFT: f32 = 15.0;
const MARGIN_RIGHT: f32 = 15.0;
const MARGIN_TOP: f32 = 15.0;
const MARGIN_BOTTOM: f32 = 15.0;
const LINE_HEIGHT: f32 = 4.5;
const FONT_SIZE_TITLE: f32 = 14.0;
const FONT_SIZE_HEADER: f32 = 9.0;
const FONT_SIZE_NORMAL: f32 = 8.0;
const FONT_SIZE_SMALL: f32 = 7.0;

// Column positions for the 7-column table (x positions in mm from left)
const COL_NUM: f32 = MARGIN_LEFT;
const COL_DESC: f32 = 27.0;
const COL_BUDGETED: f32 = 130.0;
const COL_REALIZED: f32 = 160.0;
const COL_USED: f32 = 190.0;
const COL_ADJ: f32 = 215.0;
const COL_ESTIMATED: f32 = 245.0;

// ── Formatting helpers ───────────────────────────────────────────────────────

fn format_currency(value: f64) -> String {
    let abs = value.abs();
    let cents = ((abs * 100.0).round()) as i64;
    let reais = cents / 100;
    let centavos = cents % 100;

    let reais_str = format_thousands(reais);
    let sign = if value < 0.0 { "-" } else { "" };
    format!("{}R$ {},{:02}", sign, reais_str, centavos)
}

fn format_thousands(n: i64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let s = n.to_string();
    let mut result = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push('.');
        }
        result.push(c);
    }
    result.chars().rev().collect()
}

fn format_percent(value: f64) -> String {
    let abs = value.abs();
    let sign = if value < 0.0 { "-" } else { "" };
    let int_part = abs as i64;
    let dec_part = ((abs - int_part as f64) * 100.0).round() as i64;
    format!("{}{},{:02}%", sign, format_thousands(int_part), dec_part)
}

// ── Data structures for PDF generation ───────────────────────────────────────

struct PdfItemRow {
    number: i32,
    name: String,
    budgeted: f64,
    realized: f64,
    used_percent: f64,
    adj_plus_margin: f64,
    estimated: f64,
}

struct PdfSubcategory {
    name: String,
    items: Vec<PdfItemRow>,
    subtotal_budgeted: f64,
    subtotal_realized: f64,
    subtotal_estimated: f64,
}

struct PdfRootCategory {
    name: String,
    subcategories: Vec<PdfSubcategory>,
    total_budgeted: f64,
    total_realized: f64,
    total_estimated: f64,
}

// ── Data loading from database ───────────────────────────────────────────────

fn load_scenario(conn: &rusqlite::Connection, scenario_id: i64) -> Result<BudgetScenario, String> {
    conn.query_row(
        "SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios WHERE id = ?",
        [scenario_id],
        |row| {
            Ok(BudgetScenario {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                year: row.get(3)?,
                base_scenario_id: row.get(4)?,
                is_baseline: row.get::<_, i32>(5)? != 0,
                is_approved: row.get::<_, i32>(6)? != 0,
                is_closed: row.get::<_, i32>(7)? != 0,
                general_adjustment: row.get(8)?,
                risk_margin: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .map_err(|e| format!("Cenario nao encontrado: {}", e))
}

fn load_parameters(conn: &rusqlite::Connection) -> Result<SystemParameters, String> {
    conn.query_row(
        "SELECT id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount FROM system_parameters WHERE id = 1",
        [],
        |row| {
            Ok(SystemParameters {
                id: row.get(0)?,
                total_square_meters: row.get(1)?,
                lot_simulation_1: row.get(2)?,
                lot_simulation_2: row.get(3)?,
                lot_simulation_3: row.get(4)?,
                habite_se_discount: row.get(5)?,
            })
        },
    )
    .map_err(|e| format!("Parametros nao encontrados: {}", e))
}

fn load_categories_flat(conn: &rusqlite::Connection, scenario_id: i64) -> Result<Vec<BudgetCategory>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at FROM budget_categories WHERE scenario_id = ? ORDER BY \"order\" ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![scenario_id], |row| {
            Ok(BudgetCategory {
                id: row.get(0)?,
                scenario_id: row.get(1)?,
                parent_category_id: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                code: row.get(5)?,
                item_type: row.get(6)?,
                order: row.get(7)?,
                adjustment_percent: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                subcategories: Vec::new(),
                items: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut cats = Vec::new();
    for row in rows {
        cats.push(row.map_err(|e| e.to_string())?);
    }
    Ok(cats)
}

/// Walks up the category hierarchy to find the first non-null adjustment_percent.
fn find_category_adjustment(conn: &rusqlite::Connection, category_id: i64) -> Option<f64> {
    let result: Result<(Option<f64>, Option<i64>), _> = conn.query_row(
        "SELECT adjustment_percent, parent_category_id FROM budget_categories WHERE id = ?",
        [category_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    match result {
        Ok((Some(adj), _)) => Some(adj),
        Ok((None, Some(parent_id))) => find_category_adjustment(conn, parent_id),
        _ => None,
    }
}

fn calculate_effective_adjustment(
    conn: &rusqlite::Connection,
    item_adjustment: Option<f64>,
    category_id: i64,
    general_adjustment: f64,
) -> f64 {
    if let Some(adj) = item_adjustment {
        return adj;
    }
    if let Some(adj) = find_category_adjustment(conn, category_id) {
        return adj;
    }
    if general_adjustment != 0.0 {
        return general_adjustment;
    }
    0.0
}

/// Build structured data for a given item_type ("expense" or "revenue").
fn build_root_categories(
    conn: &rusqlite::Connection,
    all_cats: &[BudgetCategory],
    item_type: &str,
    scenario: &BudgetScenario,
) -> Result<Vec<PdfRootCategory>, String> {
    let roots: Vec<&BudgetCategory> = all_cats
        .iter()
        .filter(|c| c.parent_category_id.is_none() && c.item_type == item_type)
        .collect();

    let mut result = Vec::new();

    for root in roots {
        let root_id = root.id.unwrap();
        // Get subcategories of this root
        let subs: Vec<&BudgetCategory> = all_cats
            .iter()
            .filter(|c| c.parent_category_id == Some(root_id))
            .collect();

        let mut pdf_subs = Vec::new();
        let mut root_budgeted = 0.0;
        let mut root_realized = 0.0;
        let mut root_estimated = 0.0;

        // Items directly under root category (no subcategory)
        let direct_items = load_items_for_pdf(conn, root_id, scenario)?;
        if !direct_items.is_empty() {
            let mut sub_budgeted = 0.0;
            let mut sub_realized = 0.0;
            let mut sub_estimated = 0.0;
            for item in &direct_items {
                sub_budgeted += item.budgeted;
                sub_realized += item.realized;
                sub_estimated += item.estimated;
            }
            root_budgeted += sub_budgeted;
            root_realized += sub_realized;
            root_estimated += sub_estimated;
            pdf_subs.push(PdfSubcategory {
                name: "(Itens diretos)".to_string(),
                items: direct_items,
                subtotal_budgeted: sub_budgeted,
                subtotal_realized: sub_realized,
                subtotal_estimated: sub_estimated,
            });
        }

        for sub in subs {
            let sub_id = sub.id.unwrap();
            let items = load_items_for_category_recursive(conn, sub_id, all_cats, scenario)?;
            let mut sub_budgeted = 0.0;
            let mut sub_realized = 0.0;
            let mut sub_estimated = 0.0;
            for item in &items {
                sub_budgeted += item.budgeted;
                sub_realized += item.realized;
                sub_estimated += item.estimated;
            }
            root_budgeted += sub_budgeted;
            root_realized += sub_realized;
            root_estimated += sub_estimated;
            pdf_subs.push(PdfSubcategory {
                name: sub.name.clone(),
                items,
                subtotal_budgeted: sub_budgeted,
                subtotal_realized: sub_realized,
                subtotal_estimated: sub_estimated,
            });
        }

        result.push(PdfRootCategory {
            name: root.name.clone(),
            subcategories: pdf_subs,
            total_budgeted: root_budgeted,
            total_realized: root_realized,
            total_estimated: root_estimated,
        });
    }

    Ok(result)
}

/// Load items for a category and all its descendants recursively.
fn load_items_for_category_recursive(
    conn: &rusqlite::Connection,
    category_id: i64,
    all_cats: &[BudgetCategory],
    scenario: &BudgetScenario,
) -> Result<Vec<PdfItemRow>, String> {
    let mut items = load_items_for_pdf(conn, category_id, scenario)?;

    // Find child categories
    let children: Vec<&BudgetCategory> = all_cats
        .iter()
        .filter(|c| c.parent_category_id == Some(category_id))
        .collect();

    for child in children {
        let child_items = load_items_for_category_recursive(conn, child.id.unwrap(), all_cats, scenario)?;
        items.extend(child_items);
    }

    Ok(items)
}

fn load_items_for_pdf(
    conn: &rusqlite::Connection,
    category_id: i64,
    scenario: &BudgetScenario,
) -> Result<Vec<PdfItemRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, adjustment_percent, repeats_next_budget, \"order\" FROM budget_items WHERE category_id = ? ORDER BY \"order\" ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(i64, String, Option<f64>, bool, i32)> = stmt
        .query_map(rusqlite::params![category_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<f64>>(2)?,
                row.get::<_, i32>(3)? != 0,
                row.get::<_, i32>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let risk_margin = scenario.risk_margin;
    let general_adj = scenario.general_adjustment;

    let mut result = Vec::new();
    for (item_id, name, item_adj, repeats_next, order) in rows {
        let effective_adj = calculate_effective_adjustment(conn, item_adj, category_id, general_adj);

        // Load the first budget_value for this item (most items have exactly one)
        let val: Option<(f64, Option<f64>, Option<f64>)> = conn
            .query_row(
                "SELECT budgeted, realized, estimated_fixed FROM budget_values WHERE item_id = ? ORDER BY id ASC LIMIT 1",
                [item_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        let (budgeted, realized, estimated_fixed) = val.unwrap_or((0.0, None, None));
        let realized = realized.unwrap_or(0.0);

        let estimated = if let Some(fixed) = estimated_fixed {
            fixed
        } else if repeats_next {
            0.0
        } else {
            let total_pct = effective_adj + risk_margin;
            budgeted * (1.0 + total_pct / 100.0)
        };

        let used_percent = if budgeted != 0.0 {
            (realized / budgeted) * 100.0
        } else {
            0.0
        };

        let adj_plus_margin = effective_adj + risk_margin;

        result.push(PdfItemRow {
            number: order,
            name,
            budgeted,
            realized,
            used_percent,
            adj_plus_margin,
            estimated,
        });
    }
    Ok(result)
}

// ── PDF rendering helpers ────────────────────────────────────────────────────

struct PdfBuilder {
    doc: PdfDocumentReference,
    font_regular: IndirectFontRef,
    font_bold: IndirectFontRef,
    current_page: PdfPageIndex,
    current_layer: PdfLayerIndex,
    y: f32, // current y position in mm (top of content area)
}

impl PdfBuilder {
    fn new(title: &str) -> Result<Self, String> {
        let (doc, page, layer) =
            PdfDocument::new(title, Mm(PAGE_W), Mm(PAGE_H), "Layer 1");
        let font_regular = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|e| e.to_string())?;
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|e| e.to_string())?;
        Ok(Self {
            doc,
            font_regular,
            font_bold,
            current_page: page,
            current_layer: layer,
            y: PAGE_H - MARGIN_TOP,
        })
    }

    fn layer(&self) -> PdfLayerReference {
        self.doc
            .get_page(self.current_page)
            .get_layer(self.current_layer)
    }

    fn new_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(PAGE_W), Mm(PAGE_H), "Layer 1");
        self.current_page = page;
        self.current_layer = layer;
        self.y = PAGE_H - MARGIN_TOP;
    }

    fn check_page_break(&mut self, needed: f32) {
        if self.y - needed < MARGIN_BOTTOM {
            self.new_page();
        }
    }

    fn text(&self, text: &str, x: f32, y: f32, size: f32, bold: bool) {
        let layer = self.layer();
        let font = if bold {
            &self.font_bold
        } else {
            &self.font_regular
        };
        layer.use_text(text, size, Mm(x), Mm(y), font);
    }

    fn hline(&self, x1: f32, x2: f32, y: f32) {
        let layer = self.layer();
        let points = vec![
            (Point::new(Mm(x1), Mm(y)), false),
            (Point::new(Mm(x2), Mm(y)), false),
        ];
        let line = Line {
            points,
            is_closed: false,
        };
        layer.set_outline_color(Color::Greyscale(Greyscale::new(0.4, None)));
        layer.set_outline_thickness(0.3);
        layer.add_line(line);
    }

    fn write_header_info(&mut self, scenario: &BudgetScenario) {
        let title = format!("Orcamento - {}", scenario.name);
        self.text(&title, MARGIN_LEFT, self.y, FONT_SIZE_TITLE, true);
        self.y -= LINE_HEIGHT * 1.5;

        let today = chrono::Local::now().format("%d/%m/%Y").to_string();
        let info = format!(
            "Ano: {}    Ajuste Geral: {}    Margem de Risco: {}    Gerado em: {}",
            scenario.year,
            format_percent(scenario.general_adjustment),
            format_percent(scenario.risk_margin),
            today
        );
        self.text(&info, MARGIN_LEFT, self.y, FONT_SIZE_NORMAL, false);
        self.y -= LINE_HEIGHT * 1.5;
        self.hline(MARGIN_LEFT, PAGE_W - MARGIN_RIGHT, self.y + LINE_HEIGHT * 0.3);
        self.y -= LINE_HEIGHT;
    }

    fn write_table_header(&mut self) {
        self.check_page_break(LINE_HEIGHT * 3.0);
        let y = self.y;
        self.text("No", COL_NUM, y, FONT_SIZE_SMALL, true);
        self.text("Descricao", COL_DESC, y, FONT_SIZE_SMALL, true);
        self.text("Orcado (R$)", COL_BUDGETED, y, FONT_SIZE_SMALL, true);
        self.text("Realizado (R$)", COL_REALIZED, y, FONT_SIZE_SMALL, true);
        self.text("Utilizado (%)", COL_USED, y, FONT_SIZE_SMALL, true);
        self.text("Ajuste+Margem", COL_ADJ, y, FONT_SIZE_SMALL, true);
        self.text("Estimado (R$)", COL_ESTIMATED, y, FONT_SIZE_SMALL, true);
        self.y -= LINE_HEIGHT * 0.5;
        self.hline(MARGIN_LEFT, PAGE_W - MARGIN_RIGHT, self.y);
        self.y -= LINE_HEIGHT;
    }

    fn write_section(
        &mut self,
        root_cats: &[PdfRootCategory],
        section_title: &str,
    ) {
        // Section title
        self.check_page_break(LINE_HEIGHT * 4.0);
        self.text(section_title, MARGIN_LEFT, self.y, FONT_SIZE_HEADER + 2.0, true);
        self.y -= LINE_HEIGHT * 1.5;

        for root in root_cats {
            // Root category title
            self.check_page_break(LINE_HEIGHT * 3.0);
            self.text(&root.name, MARGIN_LEFT, self.y, FONT_SIZE_HEADER, true);
            self.y -= LINE_HEIGHT;

            self.write_table_header();

            for sub in &root.subcategories {
                // Subcategory header
                self.check_page_break(LINE_HEIGHT * 2.0);
                self.text(&format!("  {}", sub.name), COL_DESC, self.y, FONT_SIZE_NORMAL, true);
                self.y -= LINE_HEIGHT;

                // Items
                for item in &sub.items {
                    self.check_page_break(LINE_HEIGHT * 1.5);
                    let y = self.y;
                    self.text(&item.number.to_string(), COL_NUM, y, FONT_SIZE_NORMAL, false);
                    // Truncate long names
                    let display_name = if item.name.len() > 40 {
                        format!("{}...", &item.name[..37])
                    } else {
                        item.name.clone()
                    };
                    self.text(&display_name, COL_DESC, y, FONT_SIZE_NORMAL, false);
                    self.text(&format_currency(item.budgeted), COL_BUDGETED, y, FONT_SIZE_NORMAL, false);
                    self.text(&format_currency(item.realized), COL_REALIZED, y, FONT_SIZE_NORMAL, false);
                    self.text(&format_percent(item.used_percent), COL_USED, y, FONT_SIZE_NORMAL, false);
                    self.text(&format_percent(item.adj_plus_margin), COL_ADJ, y, FONT_SIZE_NORMAL, false);
                    self.text(&format_currency(item.estimated), COL_ESTIMATED, y, FONT_SIZE_NORMAL, false);
                    self.y -= LINE_HEIGHT;
                }

                // Subcategory subtotal
                if !sub.items.is_empty() {
                    self.check_page_break(LINE_HEIGHT * 1.5);
                    self.hline(COL_BUDGETED, PAGE_W - MARGIN_RIGHT, self.y + LINE_HEIGHT * 0.3);
                    self.y -= LINE_HEIGHT * 0.3;
                    let y = self.y;
                    self.text("Subtotal", COL_DESC, y, FONT_SIZE_NORMAL, true);
                    self.text(&format_currency(sub.subtotal_budgeted), COL_BUDGETED, y, FONT_SIZE_NORMAL, true);
                    self.text(&format_currency(sub.subtotal_realized), COL_REALIZED, y, FONT_SIZE_NORMAL, true);
                    self.text(&format_currency(sub.subtotal_estimated), COL_ESTIMATED, y, FONT_SIZE_NORMAL, true);
                    self.y -= LINE_HEIGHT * 1.2;
                }
            }

            // Root total
            self.check_page_break(LINE_HEIGHT * 2.0);
            self.hline(MARGIN_LEFT, PAGE_W - MARGIN_RIGHT, self.y + LINE_HEIGHT * 0.3);
            self.y -= LINE_HEIGHT * 0.3;
            let y = self.y;
            self.text(&format!("TOTAL {}", root.name), COL_DESC, y, FONT_SIZE_HEADER, true);
            self.text(&format_currency(root.total_budgeted), COL_BUDGETED, y, FONT_SIZE_HEADER, true);
            self.text(&format_currency(root.total_realized), COL_REALIZED, y, FONT_SIZE_HEADER, true);
            self.text(&format_currency(root.total_estimated), COL_ESTIMATED, y, FONT_SIZE_HEADER, true);
            self.y -= LINE_HEIGHT * 2.0;
        }
    }

    fn write_executive_summary(
        &mut self,
        total_rev_budgeted: f64,
        total_rev_realized: f64,
        total_rev_estimated: f64,
        total_exp_budgeted: f64,
        total_exp_realized: f64,
        total_exp_estimated: f64,
    ) {
        self.new_page();

        self.text("Resumo Executivo", MARGIN_LEFT, self.y, FONT_SIZE_TITLE, true);
        self.y -= LINE_HEIGHT * 2.0;

        // Table header
        let col1 = MARGIN_LEFT;
        let col2: f32 = 80.0;
        let col3: f32 = 140.0;
        let col4: f32 = 200.0;

        self.text("", col1, self.y, FONT_SIZE_HEADER, true);
        self.text("Orcado", col2, self.y, FONT_SIZE_HEADER, true);
        self.text("Realizado", col3, self.y, FONT_SIZE_HEADER, true);
        self.text("Estimado", col4, self.y, FONT_SIZE_HEADER, true);
        self.y -= LINE_HEIGHT * 0.5;
        self.hline(col1, 260.0, self.y);
        self.y -= LINE_HEIGHT;

        // Receitas row
        self.text("Receitas", col1, self.y, FONT_SIZE_NORMAL, true);
        self.text(&format_currency(total_rev_budgeted), col2, self.y, FONT_SIZE_NORMAL, false);
        self.text(&format_currency(total_rev_realized), col3, self.y, FONT_SIZE_NORMAL, false);
        self.text(&format_currency(total_rev_estimated), col4, self.y, FONT_SIZE_NORMAL, false);
        self.y -= LINE_HEIGHT;

        // Despesas row
        self.text("Despesas", col1, self.y, FONT_SIZE_NORMAL, true);
        self.text(&format_currency(total_exp_budgeted), col2, self.y, FONT_SIZE_NORMAL, false);
        self.text(&format_currency(total_exp_realized), col3, self.y, FONT_SIZE_NORMAL, false);
        self.text(&format_currency(total_exp_estimated), col4, self.y, FONT_SIZE_NORMAL, false);
        self.y -= LINE_HEIGHT * 0.5;
        self.hline(col1, 260.0, self.y);
        self.y -= LINE_HEIGHT;

        // Saldo row
        let saldo_budgeted = total_rev_budgeted - total_exp_budgeted;
        let saldo_realized = total_rev_realized - total_exp_realized;
        let saldo_estimated = total_rev_estimated - total_exp_estimated;
        self.text("Saldo", col1, self.y, FONT_SIZE_HEADER, true);
        self.text(&format_currency(saldo_budgeted), col2, self.y, FONT_SIZE_HEADER, true);
        self.text(&format_currency(saldo_realized), col3, self.y, FONT_SIZE_HEADER, true);
        self.text(&format_currency(saldo_estimated), col4, self.y, FONT_SIZE_HEADER, true);
        self.y -= LINE_HEIGHT * 0.5;
        self.hline(col1, 260.0, self.y);
        self.y -= LINE_HEIGHT * 2.0;
    }

    fn write_tax_simulation(
        &mut self,
        params: &SystemParameters,
        total_rev_estimated: f64,
    ) {
        if params.total_square_meters <= 0.0 {
            return;
        }

        self.text("Simulacao de Taxa Condominial", MARGIN_LEFT, self.y, FONT_SIZE_TITLE, true);
        self.y -= LINE_HEIGHT * 2.0;

        let info = format!(
            "Area total do condominio: {} m2    Desconto habite-se: {}",
            format_thousands(params.total_square_meters as i64),
            format_percent(params.habite_se_discount)
        );
        self.text(&info, MARGIN_LEFT, self.y, FONT_SIZE_NORMAL, false);
        self.y -= LINE_HEIGHT * 1.5;

        let lots = [
            ("Lote 1", params.lot_simulation_1),
            ("Lote 2", params.lot_simulation_2),
            ("Lote 3", params.lot_simulation_3),
        ];

        let col1 = MARGIN_LEFT;
        let col2: f32 = 60.0;
        let col3: f32 = 110.0;
        let col4: f32 = 170.0;

        self.text("Tipo", col1, self.y, FONT_SIZE_HEADER, true);
        self.text("Area (m2)", col2, self.y, FONT_SIZE_HEADER, true);
        self.text("Taxa Mensal", col3, self.y, FONT_SIZE_HEADER, true);
        self.text("Com Desconto Habite-se", col4, self.y, FONT_SIZE_HEADER, true);
        self.y -= LINE_HEIGHT * 0.5;
        self.hline(col1, 240.0, self.y);
        self.y -= LINE_HEIGHT;

        for (label, lot_size) in &lots {
            if *lot_size <= 0.0 {
                continue;
            }
            let monthly_fee = (total_rev_estimated / params.total_square_meters) * lot_size / 12.0;
            let discounted = monthly_fee * (1.0 - params.habite_se_discount / 100.0);

            self.text(label, col1, self.y, FONT_SIZE_NORMAL, false);
            self.text(&format!("{} m2", format_thousands(*lot_size as i64)), col2, self.y, FONT_SIZE_NORMAL, false);
            self.text(&format_currency(monthly_fee), col3, self.y, FONT_SIZE_NORMAL, false);
            self.text(&format_currency(discounted), col4, self.y, FONT_SIZE_NORMAL, false);
            self.y -= LINE_HEIGHT;
        }
    }

    fn save(self) -> Result<Vec<u8>, String> {
        let mut buf = BufWriter::new(Vec::new());
        self.doc
            .save(&mut buf)
            .map_err(|e| format!("Erro ao salvar PDF: {}", e))?;
        buf.into_inner()
            .map_err(|e| format!("Erro ao finalizar buffer: {}", e))
    }
}

// ── Main command ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn generate_pdf(db: State<Database>, scenario_id: i64) -> Result<Vec<u8>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Load data
    let scenario = load_scenario(&conn, scenario_id)?;
    let params = load_parameters(&conn)?;
    let all_cats = load_categories_flat(&conn, scenario_id)?;

    // Build structured data
    let expense_roots = build_root_categories(&conn, &all_cats, "expense", &scenario)?;
    let revenue_roots = build_root_categories(&conn, &all_cats, "revenue", &scenario)?;

    // Compute totals
    let total_exp_budgeted: f64 = expense_roots.iter().map(|r| r.total_budgeted).sum();
    let total_exp_realized: f64 = expense_roots.iter().map(|r| r.total_realized).sum();
    let total_exp_estimated: f64 = expense_roots.iter().map(|r| r.total_estimated).sum();
    let total_rev_budgeted: f64 = revenue_roots.iter().map(|r| r.total_budgeted).sum();
    let total_rev_realized: f64 = revenue_roots.iter().map(|r| r.total_realized).sum();
    let total_rev_estimated: f64 = revenue_roots.iter().map(|r| r.total_estimated).sum();

    // Build PDF
    let title = format!("Orcamento - {}", scenario.name);
    let mut pdf = PdfBuilder::new(&title)?;

    // Page 1+: Header + Expenses table
    pdf.write_header_info(&scenario);
    pdf.write_section(&expense_roots, "DESPESAS");

    // Revenues table (continues on same or new page as needed)
    pdf.write_section(&revenue_roots, "RECEITAS");

    // Executive summary page
    pdf.write_executive_summary(
        total_rev_budgeted,
        total_rev_realized,
        total_rev_estimated,
        total_exp_budgeted,
        total_exp_realized,
        total_exp_estimated,
    );

    // Tax simulation (on same page as executive summary)
    pdf.write_tax_simulation(&params, total_rev_estimated);

    pdf.save()
}
