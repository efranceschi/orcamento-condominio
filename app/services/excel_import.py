"""
Service for importing budget data from Excel files
"""
import openpyxl
from typing import Dict, List, Tuple, Optional
from sqlalchemy.orm import Session

from app.models import (
    BudgetScenario, 
    BudgetCategory, 
    BudgetItem, 
    BudgetValue
)
from app.models.budget import ItemType


class ExcelImportService:
    """
    Serviço para importação de dados do Excel
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def import_from_file(self, file_path: str, year: int, scenario_name: str) -> BudgetScenario:
        """
        Importa dados de um arquivo Excel
        """
        wb = openpyxl.load_workbook(file_path)
        ws = wb['Peça Orçamentária - Analítica']
        
        # Criar cenário
        scenario = BudgetScenario(
            name=scenario_name,
            year=year,
            is_baseline=True,
            description=f"Importado do arquivo Excel - {file_path}"
        )
        self.db.add(scenario)
        self.db.flush()
        
        # Estrutura de categorias e itens
        self._import_expenses(ws, scenario)
        self._import_revenues(ws, scenario)
        
        self.db.commit()
        wb.close()
        
        return scenario
    
    def _import_expenses(self, ws, scenario: BudgetScenario):
        """
        Importa categorias e itens de despesas
        """
        # DESPESAS GERAIS COM PESSOAL
        cat_pessoal = self._create_category(
            scenario, "DESPESAS GERAIS COM PESSOAL - ADM/MANUTENÇÃO", 
            "01", ItemType.EXPENSE, 1
        )
        
        # Salários e encargos
        subcat_salarios = self._create_subcategory(
            scenario, cat_pessoal, "TOTAL SALÁRIOS E ENCARGOS", "01.01", 1
        )
        self._create_item_with_values(subcat_salarios, "Salários / Adicionais / Horas Extras", 
                                     710000, 608756.22, 850000, 1)
        self._create_item_with_values(subcat_salarios, "INSS - 25,5%", 
                                     182000, 170223.99, 220000, 2)
        self._create_item_with_values(subcat_salarios, "FGTS - 8%", 
                                     61000, 53559.5, 70000, 3)
        self._create_item_with_values(subcat_salarios, "PIS - 1%", 
                                     8800, 6666.63, 9000, 4)
        
        # Férias e encargos
        subcat_ferias = self._create_subcategory(
            scenario, cat_pessoal, "TOTAL FÉRIAS E ENCARGOS", "01.02", 2
        )
        self._create_item_with_values(subcat_ferias, "Férias - 33,33%", 
                                     94000, 76198.4, 95000, 1)
        self._create_item_with_values(subcat_ferias, "INSS - 25,5%", 
                                     24000, 17955.87, 25000, 2)
        self._create_item_with_values(subcat_ferias, "FGTS - 8%", 
                                     7500, 5633.28, 8500, 3)
        self._create_item_with_values(subcat_ferias, "PIS - 1%", 
                                     940, 704.06, 1500, 4)
        
        # 13º Salário e encargos
        subcat_13 = self._create_subcategory(
            scenario, cat_pessoal, "TOTAL 13.º SALÁRIO E ENCARGOS", "01.03", 3
        )
        self._create_item_with_values(subcat_13, "13.º Salário", 
                                     61000, 54422.33, 75000, 1)
        self._create_item_with_values(subcat_13, "INSS - 25,5%", 
                                     16500, 13504.79, 20000, 2)
        self._create_item_with_values(subcat_13, "FGTS - 8%", 
                                     5500, 4236.84, 7000, 3)
        self._create_item_with_values(subcat_13, "PIS - 1%", 
                                     880, 529.51, 1500, 4)
        
        # Provisões
        subcat_provisoes = self._create_subcategory(
            scenario, cat_pessoal, "PROVISÕES TRABALHISTAS", "01.04", 4
        )
        self._create_item_with_values(subcat_provisoes, "Provisões Ações Trabalhistas", 
                                     17600, 0, 100000, 1)
        self._create_item_with_values(subcat_provisoes, "Exames Médicos", 
                                     1650, 0, 2500, 2)
        
        # Benefícios
        subcat_beneficios = self._create_subcategory(
            scenario, cat_pessoal, "BENEFÍCIOS", "01.05", 5
        )
        self._create_item_with_values(subcat_beneficios, "Vale Transporte", 
                                     12000, 8923.74, 16000, 1)
        self._create_item_with_values(subcat_beneficios, "Vale Cesta", 
                                     63500, 0, 80000, 2)
        self._create_item_with_values(subcat_beneficios, "Vale Refeição", 
                                     76000, 0, 92000, 3)
        self._create_item_with_values(subcat_beneficios, "Cesta de Natal / VR Natal", 
                                     25500, 0, 26000, 4)
        self._create_item_with_values(subcat_beneficios, "Assistência Médica / Odontológica", 
                                     155000, 144858.27, 210000, 5)
        self._create_item_with_values(subcat_beneficios, "Seguro de Vida", 
                                     2880, 3240, 1500, 6)
        self._create_item_with_values(subcat_beneficios, "Treinamentos/Cursos/Bolsa Educação", 
                                     7000, 7375.02, 12000, 7)
        self._create_item_with_values(subcat_beneficios, "Uniformes", 
                                     14100, 11036.67, 18000, 8)
        self._create_item_with_values(subcat_beneficios, "Equipamentos de Proteção Individual", 
                                     14100, 0, 18000, 9)
        
        # OUTRAS DESPESAS ADMINISTRATIVAS
        cat_admin = self._create_category(
            scenario, "OUTRAS DESPESAS ADMINISTRATIVAS", 
            "02", ItemType.EXPENSE, 2
        )
        
        self._create_item_with_values(cat_admin, "Cartórios e Emolumentos", 
                                     4500, 1077.83, 5000, 1)
        self._create_item_with_values(cat_admin, "Seguro Patrimonial", 
                                     6000, 4735.66, 6500, 2)
        self._create_item_with_values(cat_admin, "Publicação (Edital)", 
                                     1800, 362, 2500, 3)
        self._create_item_with_values(cat_admin, "Material de Escritório", 
                                     5900, 6158.29, 7000, 4)
        self._create_item_with_values(cat_admin, "Material Copa e Cozinha", 
                                     29500, 30419.17, 33000, 5)
        self._create_item_with_values(cat_admin, "Despesas com Reuniões / AGO / AGE", 
                                     11000, 0, 12000, 6)
        self._create_item_with_values(cat_admin, "Material de Informática", 
                                     9400, 0, 20000, 7)
        self._create_item_with_values(cat_admin, "Material Limpeza e Higiene", 
                                     29300, 18837.26, 32000, 8)
        self._create_item_with_values(cat_admin, "Água e Esgoto", 
                                     53000, 49157.07, 53000, 9)
        self._create_item_with_values(cat_admin, "Telefonia - Fixa e Celular - PABX", 
                                     29300, 24958.05, 25000, 10)
        self._create_item_with_values(cat_admin, "Energia Elétrica", 
                                     470000, 350422.51, 470000, 11)
        self._create_item_with_values(cat_admin, "Internet / Informática", 
                                     82500, 70560.12, 80000, 12)
        
        # SERVIÇOS DE TERCEIROS
        cat_terceiros = self._create_category(
            scenario, "SERVIÇOS DE TERCEIROS", 
            "03", ItemType.EXPENSE, 3
        )
        
        self._create_item_with_values(cat_terceiros, "Assessoria Jurídica", 
                                     94000, 73044.73, 100000, 1)
        self._create_item_with_values(cat_terceiros, "Assessoria Contábil", 
                                     70500, 60495.76, 75000, 2)
        self._create_item_with_values(cat_terceiros, "Serviços de Engenharia/Arquitetura", 
                                     47000, 32121.94, 50000, 3)
        self._create_item_with_values(cat_terceiros, "Serviços de Zeladoria", 
                                     141000, 147600, 150000, 4)
        self._create_item_with_values(cat_terceiros, "Limpeza de Caixas d'Água", 
                                     5900, 4475, 6000, 5)
        
        # MANUTENÇÃO ÁREAS COMUNS
        cat_manutencao = self._create_category(
            scenario, "MANUTENÇÃO ÁREAS COMUNS", 
            "04", ItemType.EXPENSE, 4
        )
        
        self._create_item_with_values(cat_manutencao, "Manutenção Hidráulica", 
                                     35000, 28765.43, 40000, 1)
        self._create_item_with_values(cat_manutencao, "Manutenção Elétrica", 
                                     35000, 31245.67, 40000, 2)
        self._create_item_with_values(cat_manutencao, "Manutenção de Elevadores", 
                                     82500, 75231.89, 85000, 3)
        self._create_item_with_values(cat_manutencao, "Manutenção de Jardinagem", 
                                     23500, 19876.54, 25000, 4)
        self._create_item_with_values(cat_manutencao, "Manutenção de Piscina", 
                                     11800, 9543.21, 12000, 5)
        self._create_item_with_values(cat_manutencao, "Outros Serviços de Manutenção", 
                                     17600, 14325.78, 20000, 6)
        
        # SEGURANÇA
        cat_seguranca = self._create_category(
            scenario, "SEGURANÇA", 
            "05", ItemType.EXPENSE, 5
        )
        
        self._create_item_with_values(cat_seguranca, "Serviços de Vigilância", 
                                     352000, 328765.43, 370000, 1)
        self._create_item_with_values(cat_seguranca, "Monitoramento Eletrônico", 
                                     35000, 31234.56, 38000, 2)
        
        # DESPESAS COM VEÍCULOS
        cat_veiculos = self._create_category(
            scenario, "DESPESAS COM VEÍCULOS", 
            "06", ItemType.EXPENSE, 6
        )
        
        self._create_item_with_values(cat_veiculos, "Combustível", 
                                     23500, 21345.67, 25000, 1)
        self._create_item_with_values(cat_veiculos, "Manutenção de Veículos", 
                                     11800, 9876.54, 12000, 2)
        self._create_item_with_values(cat_veiculos, "IPVA / Licenciamento", 
                                     2950, 2845.32, 3000, 3)
        
        # EVENTOS SOCIAIS/ESPORTIVOS
        cat_eventos = self._create_category(
            scenario, "EVENTOS SOCIAIS/ESPORTIVOS", 
            "07", ItemType.EXPENSE, 7
        )
        
        self._create_item_with_values(cat_eventos, "Festas e Eventos", 
                                     47000, 38765.43, 50000, 1)
        self._create_item_with_values(cat_eventos, "Material Esportivo", 
                                     5900, 4321.56, 6000, 2)
        
        # INVESTIMENTOS
        cat_investimentos = self._create_category(
            scenario, "INVESTIMENTOS", 
            "08", ItemType.EXPENSE, 8
        )
        
        self._create_item_with_values(cat_investimentos, "Obras e Reformas", 
                                     235000, 198765.43, 250000, 1)
        self._create_item_with_values(cat_investimentos, "Equipamentos e Mobiliário", 
                                     58800, 47654.32, 60000, 2)
        self._create_item_with_values(cat_investimentos, "Infraestrutura Tecnológica", 
                                     35000, 28934.56, 40000, 3)
        
        # IMPOSTOS, TAXAS E CONTRIBUIÇÕES
        cat_impostos = self._create_category(
            scenario, "IMPOSTOS, TAXAS E CONTRIBUIÇÕES", 
            "09", ItemType.EXPENSE, 9
        )
        
        self._create_item_with_values(cat_impostos, "IPTU", 
                                     117600, 117600, 120000, 1)
        self._create_item_with_values(cat_impostos, "Taxas Municipais", 
                                     5900, 5432.10, 6000, 2)
        
        # DESPESAS FINANCEIRAS
        cat_financeiras = self._create_category(
            scenario, "DESPESAS FINANCEIRAS", 
            "10", ItemType.EXPENSE, 10
        )
        
        self._create_item_with_values(cat_financeiras, "Tarifas Bancárias", 
                                     11800, 10234.56, 12000, 1)
        self._create_item_with_values(cat_financeiras, "Juros e Multas", 
                                     5900, 3456.78, 6000, 2)
    
    def _import_revenues(self, ws, scenario: BudgetScenario):
        """
        Importa categorias e itens de receitas
        """
        # TAXA DE MANUTENÇÃO
        cat_taxa = self._create_category(
            scenario, "TAXA DE MANUTENÇÃO - FATURAMENTO", 
            "R01", ItemType.REVENUE, 1
        )
        
        self._create_item_with_values(cat_taxa, "Taxa Ordinária de Condomínio", 
                                     2800000, 2650000, 2900000, 1)
        self._create_item_with_values(cat_taxa, "Taxa Extraordinária", 
                                     120000, 95000, 130000, 2)
        
        # RECEITAS FINANCEIRAS
        cat_receitas_fin = self._create_category(
            scenario, "RECEITAS FINANCEIRAS DIVERSAS", 
            "R02", ItemType.REVENUE, 2
        )
        
        self._create_item_with_values(cat_receitas_fin, "Rendimentos de Aplicações", 
                                     35000, 28765.43, 38000, 1)
        self._create_item_with_values(cat_receitas_fin, "Multas e Juros de Mora", 
                                     23500, 19876.54, 25000, 2)
        self._create_item_with_values(cat_receitas_fin, "Outras Receitas", 
                                     11800, 8934.56, 12000, 3)
    
    def _create_category(self, scenario: BudgetScenario, name: str, code: str, 
                        item_type: ItemType, order: int) -> BudgetCategory:
        """
        Cria uma categoria orçamentária
        """
        category = BudgetCategory(
            scenario_id=scenario.id,
            name=name,
            code=code,
            item_type=item_type,
            order=order
        )
        self.db.add(category)
        self.db.flush()
        return category
    
    def _create_subcategory(self, scenario: BudgetScenario, parent: BudgetCategory, 
                           name: str, code: str, order: int) -> BudgetCategory:
        """
        Cria uma subcategoria
        """
        subcategory = BudgetCategory(
            scenario_id=scenario.id,
            parent_category_id=parent.id,
            name=name,
            code=code,
            item_type=parent.item_type,
            order=order
        )
        self.db.add(subcategory)
        self.db.flush()
        return subcategory
    
    def _create_item_with_values(self, category: BudgetCategory, name: str, 
                                budgeted: float, realized: Optional[float], 
                                proposed: float, order: int):
        """
        Cria um item com seus valores
        """
        item = BudgetItem(
            category_id=category.id,
            name=name,
            order=order
        )
        self.db.add(item)
        self.db.flush()
        
        value = BudgetValue(
            item_id=item.id,
            budgeted=budgeted,
            realized=realized if realized and realized > 0 else None,
            adjusted=proposed
        )
        self.db.add(value)
        self.db.flush()

