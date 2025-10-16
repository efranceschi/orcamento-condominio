"""
Serviço para geração de relatórios em PDF
"""
from io import BytesIO
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from sqlalchemy.orm import Session
from app.models import BudgetScenario, BudgetCategory, BudgetItem, SystemParameters


def format_currency(value):
    """Formata valor como moeda brasileira"""
    if value is None or value == 0:
        return "R$ 0,00"
    try:
        return f"R$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (ValueError, TypeError):
        return "R$ 0,00"


def format_percent(value):
    """Formata valor como porcentagem"""
    if value is None or value == 0:
        return "0,0%"
    try:
        return f"{float(value):.1f}%".replace(".", ",")
    except (ValueError, TypeError):
        return "0,0%"


class BudgetPDFGenerator:
    """Gerador de PDF para orçamentos"""
    
    def __init__(self, scenario: BudgetScenario, categories: list, db: Session):
        self.scenario = scenario
        self.categories = categories
        self.db = db
        self.buffer = BytesIO()
        
        # Configurar página em paisagem (landscape)
        self.doc = SimpleDocTemplate(
            self.buffer,
            pagesize=landscape(A4),
            rightMargin=1.5*cm,
            leftMargin=1.5*cm,
            topMargin=1.5*cm,
            bottomMargin=1.5*cm
        )
        
        # Estilos
        self.styles = getSampleStyleSheet()
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#1f2937'),
            spaceAfter=12,
            alignment=1  # Center
        )
        self.section_style = ParagraphStyle(
            'Section',
            parent=self.styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#3b82f6'),
            spaceBefore=12,
            spaceAfter=6,
            leftIndent=10
        )
    
    def generate(self):
        """Gera o PDF e retorna o buffer"""
        story = []
        
        # Cabeçalho
        story.append(Paragraph(f"Orçamento - {self.scenario.name}", self.title_style))
        
        # Informações do orçamento
        info_text = (
            f"<b>Ano:</b> {self.scenario.year} | "
            f"<b>Ajuste Geral:</b> {format_percent(self.scenario.general_adjustment)} | "
            f"<b>Margem de Risco:</b> {format_percent(self.scenario.risk_margin)} | "
            f"<b>Gerado em:</b> {datetime.now().strftime('%d/%m/%Y')}"
        )
        story.append(Paragraph(info_text, self.styles['Normal']))
        story.append(Spacer(1, 0.5*cm))
        
        # Separar despesas e receitas
        root_expenses = [cat for cat in self.categories if cat.item_type == 'expense' and not cat.parent_category_id]
        root_revenues = [cat for cat in self.categories if cat.item_type == 'revenue' and not cat.parent_category_id]
        
        # DESPESAS
        story.append(Paragraph("🔴 DESPESAS", self.section_style))
        story.append(Spacer(1, 0.3*cm))
        expense_table = self._generate_table(root_expenses, 1)
        story.append(expense_table)
        story.append(Spacer(1, 0.5*cm))
        
        # RECEITAS
        story.append(Paragraph("🟢 RECEITAS", self.section_style))
        story.append(Spacer(1, 0.3*cm))
        revenue_table = self._generate_table(root_revenues, len(root_expenses) + 1)
        story.append(revenue_table)
        
        # Nova página para sumário e análise
        story.append(PageBreak())
        
        # SUMÁRIO EXECUTIVO
        story.append(Paragraph("📊 SUMÁRIO EXECUTIVO", self.section_style))
        story.append(Spacer(1, 0.3*cm))
        
        # Calcular totais
        totals = self._calculate_totals()
        summary_table = self._generate_summary_table(totals)
        story.append(summary_table)
        story.append(Spacer(1, 0.5*cm))
        
        # SIMULAÇÕES DE TAXAS
        parameters = self.db.query(SystemParameters).first()
        if parameters and parameters.total_square_meters > 0:
            story.append(Paragraph("🏠 SIMULAÇÃO DE TAXAS DE MANUTENÇÃO", self.section_style))
            story.append(Spacer(1, 0.3*cm))
            lot_tables = self._generate_lot_simulations(totals, parameters)
            for lot_table in lot_tables:
                story.append(lot_table)
                story.append(Spacer(1, 0.3*cm))
        
        # Gerar PDF
        self.doc.build(story)
        self.buffer.seek(0)
        return self.buffer
    
    def _generate_table(self, root_categories, start_number):
        """Gera tabela para um tipo de categoria (despesa ou receita)"""
        # Cabeçalho da tabela
        data = [[
            'Nº',
            'Descrição',
            'Orçado (R$)',
            'Realizado (R$)',
            'Total (R$)',
            'Utilizado',
            'Aumento+Margem',
            'Estimado (R$)'
        ]]
        
        # Ordenar categorias
        sorted_categories = sorted(root_categories, key=lambda x: (x.order or 999, x.name))
        
        # Lista para rastrear linhas de categoria
        category_rows = []
        
        category_counter = start_number
        for category in sorted_categories:
            start_row = len(data)
            self._add_category_rows(data, category, str(category_counter), 0, category_rows)
            category_counter += 1
        
        # Criar tabela
        table = Table(data, colWidths=[
            2*cm,   # Nº
            8*cm,   # Descrição
            2.8*cm, # Orçado
            2.8*cm, # Realizado
            2.8*cm, # Total
            2*cm,   # Utilizado
            3*cm,   # Aumento+Margem
            2.8*cm  # Estimado
        ])
        
        # Estilo da tabela
        table_style = TableStyle([
            # Cabeçalho
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
            ('ALIGN', (0, 0), (-1, 0), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            
            # Corpo
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),  # Valores à direita
            ('ALIGN', (0, 1), (1, -1), 'LEFT'),    # Nº e Descrição à esquerda
            
            # Bordas
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            
            # Padding
            ('TOPPADDING', (0, 1), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ])
        
        # Aplicar estilo para linhas de categoria
        for row_index in category_rows:
            table_style.add('BACKGROUND', (0, row_index), (-1, row_index), colors.HexColor('#f9fafb'))
            table_style.add('FONTNAME', (0, row_index), (-1, row_index), 'Helvetica-Bold')
        
        table.setStyle(table_style)
        return table
    
    def _add_category_rows(self, data, category, number, level, category_rows):
        """Adiciona linhas de uma categoria e seus filhos recursivamente"""
        # Calcular totais da categoria
        totals = self._calculate_category_totals(category)
        
        # Formatar ajuste
        adjustment_display = '-'
        if category.adjustment_percent is not None:
            adjustment_display = f"{format_percent(category.adjustment_percent)}+{format_percent(self.scenario.risk_margin)}"
        
        # Indentação
        indent = '  ' * level
        
        # Adicionar linha da categoria e registrar índice
        category_row_index = len(data)
        category_rows.append(category_row_index)
        
        data.append([
            number,
            f"{indent}{category.name}",
            format_currency(totals['budgeted']),
            format_currency(totals['realized']),
            format_currency(totals['total']),
            format_percent(totals['used_percent']),
            adjustment_display,
            format_currency(totals['estimated'])
        ])
        
        # Subcategorias
        subcategories = [cat for cat in self.categories if cat.parent_category_id == category.id]
        sorted_subcategories = sorted(subcategories, key=lambda x: (x.order or 999, x.name))
        
        sub_counter = 1
        for subcat in sorted_subcategories:
            sub_number = f"{number}.{sub_counter}"
            self._add_category_rows(data, subcat, sub_number, level + 1, category_rows)
            sub_counter += 1
        
        # Itens da categoria
        if category.items:
            sorted_items = sorted(category.items, key=lambda x: x.name)
            item_counter = len(subcategories) + 1
            for item in sorted_items:
                item_number = f"{number}.{item_counter}"
                self._add_item_row(data, item, item_number, level + 1)
                item_counter += 1
    
    def _add_item_row(self, data, item, number, level):
        """Adiciona linha de um item"""
        value = item.values[0] if item.values else None
        
        budgeted = float(value.budgeted or 0) if value else 0.0
        realized = float(value.realized or 0) if value else 0.0
        total = realized
        used_percent = (total / budgeted * 100) if budgeted > 0 else 0.0
        
        # Calcular estimated manualmente para garantir precisão
        estimated = self._calculate_item_estimated(item, value)
        
        # Calcular ajuste efetivo
        adjustment_display = '-'
        if value and value.estimated_fixed:
            adjustment_display = '-'
        elif item.repeats_next_budget:
            adjustment_display = '-'
        else:
            effective_adjustment = self._get_effective_adjustment(item)
            adjustment_display = f"{format_percent(effective_adjustment)}+{format_percent(self.scenario.risk_margin)}"
        
        # Indicadores
        indicators = ''
        if item.is_optional:
            indicators += '⭐ '
        if item.repeats_next_budget:
            indicators += '🚫 '
        
        # Indentação
        indent = '  ' * level
        
        data.append([
            number,
            f"{indent}{item.name} {indicators}".strip(),
            format_currency(budgeted),
            format_currency(realized),
            format_currency(total),
            format_percent(used_percent),
            adjustment_display,
            format_currency(estimated)
        ])
    
    def _calculate_category_totals(self, category):
        """Calcula totais de uma categoria recursivamente"""
        budgeted = 0.0
        realized = 0.0
        estimated = 0.0
        
        # Somar itens diretos
        for item in category.items:
            if item.values:
                value = item.values[0]
                budgeted += float(value.budgeted or 0)
                realized += float(value.realized or 0)
                
                # Calcular estimated manualmente para garantir precisão
                item_estimated = self._calculate_item_estimated(item, value)
                estimated += item_estimated
        
        # Somar subcategorias
        subcategories = [cat for cat in self.categories if cat.parent_category_id == category.id]
        for subcat in subcategories:
            sub_totals = self._calculate_category_totals(subcat)
            budgeted += sub_totals['budgeted']
            realized += sub_totals['realized']
            estimated += sub_totals['estimated']
        
        total = realized
        used_percent = (total / budgeted * 100) if budgeted > 0 else 0
        
        return {
            'budgeted': budgeted,
            'realized': realized,
            'total': total,
            'used_percent': used_percent,
            'estimated': estimated
        }
    
    def _calculate_item_estimated(self, item, value):
        """Calcula o valor estimado de um item manualmente"""
        if not value:
            return 0.0
            
        # Se tem valor previsto fixo, usa ele
        if value.estimated_fixed is not None:
            return float(value.estimated_fixed)
        
        # Se o item não se repete no próximo orçamento, estimado é zero
        if item.repeats_next_budget:
            return 0.0
        
        # Obter percentual de aumento efetivo
        adjustment_percent = self._get_effective_adjustment(item)
        
        # Obter margem de risco do cenário
        risk_margin = self.scenario.risk_margin or 0
        
        # Calcular: orçado * (1 + (aumento + margem)/100)
        budgeted = float(value.budgeted or 0)
        total_percent = adjustment_percent + risk_margin
        return budgeted * (1 + total_percent / 100)
    
    def _get_effective_adjustment(self, item):
        """Obtém o percentual de ajuste efetivo de um item"""
        if item.adjustment_percent is not None:
            return item.adjustment_percent
        
        # Buscar na hierarquia de categorias
        category = next((cat for cat in self.categories if cat.id == item.category_id), None)
        while category:
            if category.adjustment_percent is not None:
                return category.adjustment_percent
            if category.parent_category_id:
                category = next((cat for cat in self.categories if cat.id == category.parent_category_id), None)
            else:
                break
        
        return self.scenario.general_adjustment or 0
    
    def _calculate_totals(self):
        """Calcula os totais de receitas e despesas"""
        revenue_budgeted = 0.0
        revenue_realized = 0.0
        revenue_estimated = 0.0
        expense_budgeted = 0.0
        expense_realized = 0.0
        expense_estimated = 0.0
        
        for category in self.categories:
            if not category.parent_category_id:  # Apenas categorias raiz
                totals = self._calculate_category_totals(category)
                if category.item_type == 'revenue':
                    revenue_budgeted += totals['budgeted']
                    revenue_realized += totals['realized']
                    revenue_estimated += totals['estimated']
                else:
                    expense_budgeted += totals['budgeted']
                    expense_realized += totals['realized']
                    expense_estimated += totals['estimated']
        
        return {
            'revenue': {
                'budgeted': revenue_budgeted,
                'realized': revenue_realized,
                'estimated': revenue_estimated
            },
            'expense': {
                'budgeted': expense_budgeted,
                'realized': expense_realized,
                'estimated': expense_estimated
            },
            'balance': {
                'budgeted': revenue_budgeted - expense_budgeted,
                'realized': revenue_realized - expense_realized,
                'estimated': revenue_estimated - expense_estimated
            }
        }
    
    def _generate_summary_table(self, totals):
        """Gera tabela sumário com receitas, despesas e saldo, incluindo reajustes"""
        # Calcular reajustes
        increasePercent = 0.0
        if totals['revenue']['budgeted'] > 0:
            increasePercent = ((totals['revenue']['estimated'] - totals['revenue']['budgeted']) / totals['revenue']['budgeted']) * 100
        
        idealIncreasePercent = 0.0
        if totals['revenue']['budgeted'] > 0:
            idealIncreasePercent = ((totals['expense']['estimated'] / totals['revenue']['budgeted']) - 1) * 100
        
        # Calcular receita ideal
        revenue_ideal = totals['revenue']['budgeted'] * (1 + idealIncreasePercent / 100)
        balance_ideal = revenue_ideal - totals['expense']['estimated']
        
        data = [
            ['', f'Orçado\n({self.scenario.year})', f'Realizado\n({self.scenario.year})', f'Previsto\n({self.scenario.year + 1})', f'Ideal\n({self.scenario.year + 1})'],
            [
                '🟢 Receitas',
                format_currency(totals['revenue']['budgeted']),
                format_currency(totals['revenue']['realized']),
                format_currency(totals['revenue']['estimated']),
                format_currency(revenue_ideal)
            ],
            [
                '🔴 Despesas',
                format_currency(totals['expense']['budgeted']),
                format_currency(totals['expense']['realized']),
                format_currency(totals['expense']['estimated']),
                format_currency(totals['expense']['estimated'])
            ],
            [
                '💰 Saldo',
                format_currency(totals['balance']['budgeted']),
                format_currency(totals['balance']['realized']),
                format_currency(totals['balance']['estimated']),
                format_currency(balance_ideal)
            ],
            ['', '', '', '', ''],  # Linha vazia
            [
                '📈 Correção Prevista',
                '',
                '',
                f'{format_percent(increasePercent)}',
                ''
            ],
            [
                '🎯 Correção Ideal',
                '',
                '',
                '',
                f'{format_percent(idealIncreasePercent)}'
            ]
        ]
        
        table = Table(data, colWidths=[5*cm, 4*cm, 4*cm, 4*cm, 4*cm])
        
        table_style = TableStyle([
            # Cabeçalho
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            
            # Corpo - linhas de valores
            ('FONTNAME', (0, 1), (-1, 3), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, 3), 9),
            ('ALIGN', (1, 1), (-1, 3), 'RIGHT'),
            ('ALIGN', (0, 1), (0, 3), 'LEFT'),
            
            # Linha de saldo em destaque
            ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#f3f4f6')),
            ('FONTNAME', (0, 3), (-1, 3), 'Helvetica-Bold'),
            
            # Linha vazia sem bordas
            ('LINEABOVE', (0, 4), (-1, 4), 0, colors.white),
            ('LINEBELOW', (0, 4), (-1, 4), 0, colors.white),
            ('GRID', (0, 4), (-1, 4), 0, colors.white),
            
            # Linhas de correção
            ('FONTNAME', (0, 5), (-1, 6), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 5), (-1, 6), 9),
            ('ALIGN', (0, 5), (-1, 6), 'LEFT'),
            ('BACKGROUND', (0, 5), (-1, 5), colors.HexColor('#eff6ff')),
            ('BACKGROUND', (0, 6), (-1, 6), colors.HexColor('#f0fdf4')),
            
            # Bordas gerais
            ('GRID', (0, 0), (-1, 3), 1, colors.HexColor('#d1d5db')),
            ('GRID', (0, 5), (-1, 6), 1, colors.HexColor('#d1d5db')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            
            # Padding
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ])
        
        table.setStyle(table_style)
        return table
    
    def _generate_lot_simulations(self, totals, parameters):
        """Gera uma única tabela com todas as simulações de lotes"""
        tables = []
        
        total_sqm = parameters.total_square_meters
        habite_se_discount = parameters.habite_se_discount or 10.0
        
        # Taxa por m² (baseado em receitas)
        rate_budgeted = totals['revenue']['budgeted'] / total_sqm if total_sqm > 0 else 0
        rate_estimated = totals['revenue']['estimated'] / total_sqm if total_sqm > 0 else 0
        
        # Calcular receita ideal
        idealIncreasePercent = 0.0
        if totals['revenue']['budgeted'] > 0:
            idealIncreasePercent = ((totals['expense']['estimated'] / totals['revenue']['budgeted']) - 1) * 100
        revenue_ideal = totals['revenue']['budgeted'] * (1 + idealIncreasePercent / 100)
        rate_ideal = revenue_ideal / total_sqm if total_sqm > 0 else 0
        
        lots = [
            ('Simulação 1', parameters.lot_simulation_1),
            ('Simulação 2', parameters.lot_simulation_2),
            ('Simulação 3', parameters.lot_simulation_3)
        ]
        
        # Construir dados da tabela
        data = [
            ['Lote', f'Ano Base\n({self.scenario.year})', f'Ano Base\n({self.scenario.year})', f'Previsto\n({self.scenario.year + 1})', f'Previsto\n({self.scenario.year + 1})', f'Ideal\n({self.scenario.year + 1})', f'Ideal\n({self.scenario.year + 1})'],
            ['', 'Sem Habite-se', f'Com Habite-se\n(-{habite_se_discount:.0f}%)', 'Sem Habite-se', f'Com Habite-se\n(-{habite_se_discount:.0f}%)', 'Sem Habite-se', f'Com Habite-se\n(-{habite_se_discount:.0f}%)']
        ]
        
        for lot_name, lot_size in lots:
            if lot_size > 0:
                # Calcular taxas anuais - Ano Base
                annual_budgeted = rate_budgeted * lot_size
                annual_budgeted_discount = annual_budgeted - (annual_budgeted * habite_se_discount / 100)
                
                # Previsto
                annual_estimated = rate_estimated * lot_size
                annual_estimated_discount = annual_estimated - (annual_estimated * habite_se_discount / 100)
                
                # Ideal
                annual_ideal = rate_ideal * lot_size
                annual_ideal_discount = annual_ideal - (annual_ideal * habite_se_discount / 100)
                
                data.append([
                    f'{lot_name}\n{lot_size:.0f} m² ({format_currency(rate_budgeted)}/m²)',
                    format_currency(annual_budgeted),
                    format_currency(annual_budgeted_discount),
                    format_currency(annual_estimated),
                    format_currency(annual_estimated_discount),
                    format_currency(annual_ideal),
                    format_currency(annual_ideal_discount)
                ])
        
        if len(data) > 2:  # Se há pelo menos uma simulação
            table = Table(data, colWidths=[4*cm, 3.2*cm, 3.2*cm, 3.2*cm, 3.2*cm, 3.2*cm, 3.2*cm])
            
            table_style = TableStyle([
                # Primeira linha do cabeçalho
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b5cf6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                
                # Segunda linha do cabeçalho
                ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#e9d5ff')),
                ('TEXTCOLOR', (0, 1), (-1, 1), colors.HexColor('#1f2937')),
                ('ALIGN', (0, 1), (-1, 1), 'CENTER'),
                ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 1), (-1, 1), 7),
                
                # Corpo
                ('FONTNAME', (0, 2), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 2), (-1, -1), 8),
                ('ALIGN', (1, 2), (-1, -1), 'RIGHT'),
                ('ALIGN', (0, 2), (0, -1), 'LEFT'),
                
                # Bordas
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                
                # Padding
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ])
            
            table.setStyle(table_style)
            tables.append(table)
        
        return tables

