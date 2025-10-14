#!/usr/bin/env python3
"""
Script de teste da API
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_api():
    print("=" * 60)
    print("TESTE DA API")
    print("=" * 60)
    
    # Test 1: Health check
    print("\n[1] Testando Health Check...")
    try:
        response = requests.get(f"{BASE_URL}/api/analysis/health")
        if response.status_code == 200:
            print("✓ Health check OK")
            print(f"  Response: {response.json()}")
        else:
            print(f"✗ Health check falhou: {response.status_code}")
    except Exception as e:
        print(f"✗ Erro: {e}")
    
    # Test 2: List scenarios
    print("\n[2] Listando cenários...")
    try:
        response = requests.get(f"{BASE_URL}/api/budgets/scenarios")
        if response.status_code == 200:
            scenarios = response.json()
            print(f"✓ {len(scenarios)} cenário(s) encontrado(s)")
            for scenario in scenarios:
                print(f"  - {scenario['name']} ({scenario['year']})")
        else:
            print(f"✗ Erro ao listar cenários: {response.status_code}")
    except Exception as e:
        print(f"✗ Erro: {e}")
    
    # Test 3: Get scenario summary
    if len(scenarios) > 0:
        print(f"\n[3] Obtendo resumo do cenário 1...")
        try:
            response = requests.get(f"{BASE_URL}/api/budgets/scenarios/1/summary")
            if response.status_code == 200:
                summary = response.json()
                print("✓ Resumo obtido com sucesso")
                print(f"  - Despesas: R$ {summary['total_expenses']:,.2f}")
                print(f"  - Receitas: R$ {summary['total_revenues']:,.2f}")
                print(f"  - Saldo: R$ {summary['balance']:,.2f}")
                print(f"  - Categorias: {len(summary['categories'])}")
            else:
                print(f"✗ Erro ao obter resumo: {response.status_code}")
        except Exception as e:
            print(f"✗ Erro: {e}")
    
    print("\n" + "=" * 60)
    print("TESTES CONCLUÍDOS")
    print("=" * 60)

if __name__ == "__main__":
    test_api()

