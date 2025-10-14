"""
Script de exemplo: Criação de tipos de lotes
Demonstra como usar a API de lotes programaticamente
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def criar_lotes_exemplo(scenario_id: int):
    """
    Cria tipos de lotes de exemplo para um cenário
    """
    lotes = [
        {
            "scenario_id": scenario_id,
            "name": "Lote Padrão",
            "description": "Lotes residenciais padrão",
            "square_meters": 250.0,
            "quantity": 20,
            "has_habite_se": True,
            "weight": 1.0,
            "price_per_sqm": 1000.0
        },
        {
            "scenario_id": scenario_id,
            "name": "Lote Premium",
            "description": "Lotes residenciais premium com área maior",
            "square_meters": 400.0,
            "quantity": 5,
            "has_habite_se": True,
            "weight": 1.2,
            "price_per_sqm": 1200.0
        },
        {
            "scenario_id": scenario_id,
            "name": "Lote em Construção",
            "description": "Lotes ainda em fase de construção sem habite-se",
            "square_meters": 300.0,
            "quantity": 3,
            "has_habite_se": False,
            "weight": 1.0,
            "price_per_sqm": None
        }
    ]
    
    print(f"\n{'='*60}")
    print(f"CRIANDO TIPOS DE LOTES PARA O CENÁRIO {scenario_id}")
    print(f"{'='*60}\n")
    
    ids_criados = []
    
    for lote in lotes:
        try:
            response = requests.post(
                f"{BASE_URL}/api/lots/types",
                json=lote
            )
            
            if response.status_code == 201:
                lote_criado = response.json()
                ids_criados.append(lote_criado['id'])
                print(f"✓ {lote_criado['name']}")
                print(f"  - ID: {lote_criado['id']}")
                print(f"  - Área: {lote_criado['square_meters']} m²")
                print(f"  - Quantidade: {lote_criado['quantity']} unidades")
                print(f"  - Área Total: {lote_criado['total_area']} m²")
                print(f"  - Habite-se: {'✅ Sim' if lote_criado['has_habite_se'] else '❌ Não'}")
                print()
            else:
                print(f"❌ Erro ao criar {lote['name']}: {response.text}")
        
        except Exception as e:
            print(f"❌ Erro ao criar {lote['name']}: {e}")
    
    return ids_criados


def calcular_rateio_exemplo(scenario_id: int, valor: float = 50000.0):
    """
    Calcula rateio de uma despesa usando diferentes critérios
    """
    print(f"\n{'='*60}")
    print(f"CALCULANDO RATEIOS PARA O CENÁRIO {scenario_id}")
    print(f"Valor da Despesa: R$ {valor:,.2f}")
    print(f"{'='*60}\n")
    
    criterios = [
        ("area", "Proporcional à Área"),
        ("equal", "Igualitário por Unidade"),
        ("habite_se", "Apenas Lotes com Habite-se")
    ]
    
    for rule_type, nome in criterios:
        try:
            response = requests.get(
                f"{BASE_URL}/api/lots/scenarios/{scenario_id}/calculate-apportionment",
                params={
                    "rule_type": rule_type,
                    "amount": valor
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"\n{'─'*60}")
                print(f"📊 {nome}")
                print(f"{'─'*60}")
                
                for lote in result['lot_apportionments']:
                    print(f"\n{lote['lot_type_name']}:")
                    print(f"  • Quantidade: {lote['quantity']} unidades")
                    print(f"  • Área Total: {lote['total_area']:.2f} m²")
                    print(f"  • Percentual: {lote['percentage']:.2f}%")
                    print(f"  • Valor por Unidade: R$ {lote['value_per_unit']:,.2f}")
                    print(f"  • Valor Total: R$ {lote['total_value']:,.2f}")
                
                print(f"\n{'─'*60}")
                print(f"Total de Lotes: {result['summary']['total_lots']}")
                print(f"Área Total: {result['summary']['total_area']:.2f} m²")
                print(f"{'─'*60}")
            
            else:
                print(f"❌ Erro ao calcular rateio {nome}: {response.text}")
        
        except Exception as e:
            print(f"❌ Erro ao calcular rateio {nome}: {e}")


def listar_lotes(scenario_id: int):
    """
    Lista todos os lotes de um cenário
    """
    try:
        response = requests.get(
            f"{BASE_URL}/api/lots/types",
            params={"scenario_id": scenario_id}
        )
        
        if response.status_code == 200:
            lotes = response.json()
            
            print(f"\n{'='*60}")
            print(f"LOTES CADASTRADOS NO CENÁRIO {scenario_id}")
            print(f"{'='*60}\n")
            
            for lote in lotes:
                print(f"• {lote['name']} (ID: {lote['id']})")
                print(f"  Área: {lote['square_meters']} m² × {lote['quantity']} = {lote['total_area']} m²")
                print(f"  Habite-se: {'✅' if lote['has_habite_se'] else '❌'}")
                print()
            
            return lotes
        else:
            print(f"❌ Erro ao listar lotes: {response.text}")
            return []
    
    except Exception as e:
        print(f"❌ Erro ao listar lotes: {e}")
        return []


def main():
    """
    Função principal
    """
    print(f"\n{'='*60}")
    print("EXEMPLO DE USO DA API DE LOTES")
    print(f"{'='*60}")
    
    # ID do cenário (ajuste conforme necessário)
    scenario_id = 1
    
    # 1. Listar lotes existentes
    lotes_existentes = listar_lotes(scenario_id)
    
    # 2. Se não houver lotes, criar exemplos
    if not lotes_existentes:
        print("\n⚠️  Nenhum lote encontrado. Criando lotes de exemplo...\n")
        criar_lotes_exemplo(scenario_id)
    
    # 3. Calcular rateios
    calcular_rateio_exemplo(scenario_id, 50000.0)
    
    print(f"\n{'='*60}")
    print("✓ EXEMPLO CONCLUÍDO")
    print(f"{'='*60}\n")
    print("Acesse http://localhost:8000/lots para visualizar na interface web")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Execução interrompida pelo usuário")
    except Exception as e:
        print(f"\n\n❌ Erro: {e}")

