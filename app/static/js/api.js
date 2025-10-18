// API Client for Budget Management System

const API_BASE_URL = '/api';

// Auth utilities
function getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function getCurrentUser() {
    return JSON.parse(localStorage.getItem('user') || '{}');
}

function isAdmin() {
    const user = getCurrentUser();
    return user.role === 'admin';
}

function isReadOnly() {
    return !isAdmin();
}

// Hide elements for read-only users
function applyReadOnlyMode() {
    if (isReadOnly()) {
        // Esconder todos os botões de edição, criação e exclusão
        const editButtons = document.querySelectorAll('[data-action="create"], [data-action="edit"], [data-action="delete"]');
        editButtons.forEach(btn => btn.style.display = 'none');
        
        // Esconder botões com classes específicas
        const actionButtons = document.querySelectorAll('.btn-primary, .btn-danger, .btn-success');
        actionButtons.forEach(btn => {
            const text = btn.textContent.toLowerCase();
            if (text.includes('criar') || text.includes('novo') || text.includes('adicionar') || 
                text.includes('excluir') || text.includes('deletar') || text.includes('salvar') ||
                text.includes('aprovar') || text.includes('editar')) {
                btn.style.display = 'none';
            }
        });
    }
}

// Utility functions
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatPercent(value, decimals = 2) {
    return `${value.toFixed(decimals)}%`;
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
        setTimeout(() => alertDiv.remove(), 5000);
    }
}

function showLoading(element) {
    element.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

// API Client
class BudgetAPI {
    // Scenarios
    static async getScenarios(year = null, isBaseline = null) {
        let url = `${API_BASE_URL}/budgets/scenarios`;
        const params = new URLSearchParams();
        if (year !== null) params.append('year', year);
        if (isBaseline !== null) params.append('is_baseline', isBaseline);

        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            // Se o banco estiver vazio, retornar array vazio ao invés de erro
            if (response.status === 404 || response.status === 500) {
                console.warn('Banco de dados vazio ou não inicializado');
                return [];
            }
            throw new Error('Erro ao buscar cenários');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }
    
    static async getScenario(scenarioId) {
        const response = await fetch(`${API_BASE_URL}/budgets/scenarios/${scenarioId}?_t=${Date.now()}`, {
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) throw new Error('Erro ao buscar cenário');
        return await response.json();
    }
    
    static async createScenario(data) {
        const response = await fetch(`${API_BASE_URL}/budgets/scenarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Erro ao criar cenário');
        return await response.json();
    }
    
    static async updateScenario(scenarioId, data) {
        const response = await fetch(`${API_BASE_URL}/budgets/scenarios/${scenarioId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Erro ao atualizar cenário');
        return await response.json();
    }
    
    static async deleteScenario(scenarioId) {
        const response = await fetch(`${API_BASE_URL}/budgets/scenarios/${scenarioId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Erro ao deletar cenário');
    }
    
    static async getScenarioSummary(scenarioId) {
        const response = await fetch(`${API_BASE_URL}/budgets/scenarios/${scenarioId}/summary`);
        if (!response.ok) throw new Error('Erro ao buscar resumo do cenário');
        return await response.json();
    }
    
    static async compareScenarios(baseId, comparedId) {
        const response = await fetch(
            `${API_BASE_URL}/budgets/scenarios/compare/${baseId}/${comparedId}`
        );
        if (!response.ok) throw new Error('Erro ao comparar cenários');
        return await response.json();
    }
    
    // Simulations
    static async createSimulation(data) {
        const response = await fetch(`${API_BASE_URL}/analysis/simulations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erro ao criar simulação');
        }
        return await response.json();
    }
    
    // Risk Analysis
    static async getRiskAnalysis(scenarioId) {
        const response = await fetch(
            `${API_BASE_URL}/analysis/scenarios/${scenarioId}/risk-analysis`
        );
        if (!response.ok) throw new Error('Erro ao buscar análise de risco');
        return await response.json();
    }
    
    static async calculateIdealBudget(scenarioId) {
        const response = await fetch(
            `${API_BASE_URL}/analysis/scenarios/${scenarioId}/ideal-budget`,
            { method: 'POST' }
        );
        if (!response.ok) throw new Error('Erro ao calcular orçamento ideal');
        return await response.json();
    }
    
    // Categories
    static async getCategories(scenarioId = null, parentId = null) {
        let url = `${API_BASE_URL}/budgets/categories`;
        const params = new URLSearchParams();
        if (scenarioId !== null) params.append('scenario_id', scenarioId);
        if (parentId !== null) params.append('parent_id', parentId);
        params.append('_t', Date.now()); // Anti-cache

        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await fetch(url, {
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) {
            // Se o banco estiver vazio, retornar array vazio
            if (response.status === 404 || response.status === 500) {
                console.warn('Nenhuma categoria encontrada ou banco não inicializado');
                return [];
            }
            throw new Error('Erro ao buscar categorias');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }
    
    static async getCategory(categoryId) {
        const response = await fetch(`${API_BASE_URL}/budgets/categories/${categoryId}`);
        if (!response.ok) throw new Error('Erro ao buscar categoria');
        return await response.json();
    }
    
    static async createCategory(data) {
        const response = await fetch(`${API_BASE_URL}/budgets/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Erro ao criar categoria');
        return await response.json();
    }
    
    static async updateCategory(categoryId, data) {
        console.log(`[API] PUT /budgets/categories/${categoryId}`, data);
        const response = await fetch(`${API_BASE_URL}/budgets/categories/${categoryId}?_t=${Date.now()}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify(data)
        });
        
        console.log(`[API] Response status:`, response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API] Error response:`, errorText);
            throw new Error('Erro ao atualizar categoria');
        }
        
        const result = await response.json();
        console.log(`[API] Response data:`, result);
        return result;
    }
    
    static async deleteCategory(categoryId) {
        const response = await fetch(`${API_BASE_URL}/budgets/categories/${categoryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Erro ao deletar categoria');
    }
    
    // Items
    static async getItem(itemId) {
        const response = await fetch(`${API_BASE_URL}/items/${itemId}`);
        if (!response.ok) throw new Error('Erro ao buscar item');
        return await response.json();
    }
    
    static async createItem(data) {
        const response = await fetch(`${API_BASE_URL}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Erro ao criar item');
        return await response.json();
    }
    
    static async updateItem(itemId, data) {
        const response = await fetch(`${API_BASE_URL}/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Erro ao atualizar item');
        return await response.json();
    }
    
    static async deleteItem(itemId) {
        const response = await fetch(`${API_BASE_URL}/items/${itemId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Erro ao deletar item');
    }
    
    static async createItemValue(data) {
        const response = await fetch(`${API_BASE_URL}/items/values`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Erro ao criar valor do item');
        return await response.json();
    }
    
    static async updateItemValue(valueId, data) {
        const response = await fetch(`${API_BASE_URL}/items/values/${valueId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Erro ao atualizar valor do item');
        return await response.json();
    }
}

// Chart utilities (using Chart.js if available)
class ChartUtils {
    static createBarChart(canvasId, labels, datasets) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não está disponível');
            return null;
        }
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        return new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }
    
    static createLineChart(canvasId, labels, datasets) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não está disponível');
            return null;
        }
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        return new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }
    
    static createPieChart(canvasId, labels, data, colors = null) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não está disponível');
            return null;
        }
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        // Se não fornecido, usar cores padrão
        if (!colors) {
            colors = [
                '#2563eb', '#10b981', '#f59e0b', '#ef4444',
                '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
            ];
        }
        
        return new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = formatCurrency(context.parsed);
                                return `${label}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Gera uma paleta de cores para despesas (tons de vermelho)
     */
    static generateExpenseColors(count) {
        const baseColors = [
            '#ef4444', // vermelho base
            '#dc2626', // vermelho escuro
            '#f87171', // vermelho claro
            '#b91c1c', // vermelho muito escuro
            '#fca5a5', // vermelho muito claro
            '#991b1b', // vermelho profundo
            '#fecaca', // vermelho pastel
            '#7f1d1d'  // vermelho quase preto
        ];
        
        // Se precisar de mais cores, repetir o padrão
        while (baseColors.length < count) {
            baseColors.push(...baseColors.slice(0, Math.min(8, count - baseColors.length)));
        }
        
        return baseColors.slice(0, count);
    }
    
    /**
     * Gera uma paleta de cores para receitas (tons de verde)
     */
    static generateRevenueColors(count) {
        const baseColors = [
            '#10b981', // verde base
            '#059669', // verde escuro
            '#34d399', // verde claro
            '#047857', // verde muito escuro
            '#6ee7b7', // verde muito claro
            '#065f46', // verde profundo
            '#a7f3d0', // verde pastel
            '#064e3b'  // verde quase preto
        ];
        
        // Se precisar de mais cores, repetir o padrão
        while (baseColors.length < count) {
            baseColors.push(...baseColors.slice(0, Math.min(8, count - baseColors.length)));
        }
        
        return baseColors.slice(0, count);
    }
    
    /**
     * Cria um gráfico de anel (doughnut)
     */
    static createDoughnutChart(canvasId, labels, data, colors = null) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não está disponível');
            return null;
        }
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        // Se não fornecido, usar cores padrão
        if (!colors) {
            colors = [
                '#2563eb', '#10b981', '#f59e0b', '#ef4444',
                '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
            ];
        }
        
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true, 
                        position: 'right',
                        labels: {
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = formatCurrency(context.parsed);
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'  // Tamanho do buraco no meio (60% = anel)
            }
        });
    }
}

// Modal utilities
class Modal {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        this.closeBtn = this.modal?.querySelector('.modal-close');
        
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
        }
        
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.hide();
                }
            });
        }
    }
    
    show() {
        if (this.modal) {
            this.modal.classList.add('active');
        }
    }
    
    hide() {
        if (this.modal) {
            this.modal.classList.remove('active');
        }
    }
}

// Export for use in other scripts
window.BudgetAPI = BudgetAPI;
window.API = BudgetAPI;  // Alias para compatibilidade
window.ChartUtils = ChartUtils;
window.Modal = Modal;
window.formatCurrency = formatCurrency;
window.formatPercent = formatPercent;
window.showAlert = showAlert;
window.showLoading = showLoading;

