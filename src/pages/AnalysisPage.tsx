import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { cn, formatCurrency, formatPercent } from "../lib/utils";
import {
  getScenario,
  getScenarioSummary,
  getParameters,
  listCategories,
} from "../lib/api";
import type {
  BudgetScenario,
  ScenarioSummary,
  SystemParameters,
  BudgetCategory,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OptionalItem {
  itemId: number;
  name: string;
  categoryName: string;
  itemType: string; // "revenue" | "expense"
  estimatedValue: number;
  budgetedValue: number;
  realizedValue: number;
}

/** Recursively collect all optional items from a category tree. */
function collectOptionalItems(
  categories: BudgetCategory[],
  parentCategoryName?: string,
): OptionalItem[] {
  const result: OptionalItem[] = [];

  for (const cat of categories) {
    const catName = parentCategoryName
      ? `${parentCategoryName} > ${cat.name}`
      : cat.name;

    for (const item of cat.items) {
      if (item.is_optional && item.id != null) {
        const val = item.values[0];
        result.push({
          itemId: item.id,
          name: item.name,
          categoryName: catName,
          itemType: cat.item_type,
          estimatedValue: val?.estimated ?? 0,
          budgetedValue: val?.budgeted ?? 0,
          realizedValue: val?.realized ?? 0,
        });
      }
    }

    if (cat.subcategories.length > 0) {
      result.push(...collectOptionalItems(cat.subcategories, catName));
    }
  }

  return result;
}

/** localStorage key for optional-item inclusion state per scenario. */
function storageKey(scenarioId: number): string {
  return `analysis_optional_included_${scenarioId}`;
}

function loadIncludedState(
  scenarioId: number,
  optionalItems: OptionalItem[],
): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(storageKey(scenarioId));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      const mapped: Record<number, boolean> = {};
      for (const item of optionalItems) {
        mapped[item.itemId] =
          parsed[String(item.itemId)] !== undefined
            ? parsed[String(item.itemId)]
            : true;
      }
      return mapped;
    }
  } catch {
    // fall through
  }
  // Default: all included
  const defaults: Record<number, boolean> = {};
  for (const item of optionalItems) {
    defaults[item.itemId] = true;
  }
  return defaults;
}

function saveIncludedState(
  scenarioId: number,
  state: Record<number, boolean>,
): void {
  localStorage.setItem(storageKey(scenarioId), JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const scenarioId = Number(id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scenario, setScenario] = useState<BudgetScenario | null>(null);
  const [summary, setSummary] = useState<ScenarioSummary | null>(null);
  const [parameters, setParameters] = useState<SystemParameters | null>(null);
  const [optionalItems, setOptionalItems] = useState<OptionalItem[]>([]);
  const [included, setIncluded] = useState<Record<number, boolean>>({});

  // --- Data loading ---
  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    Promise.all([
      getScenario(scenarioId),
      getScenarioSummary(scenarioId),
      getParameters(),
      listCategories(scenarioId),
    ])
      .then(([sc, sum, params, cats]) => {
        setScenario(sc);
        setSummary(sum);
        setParameters(params);

        const items = collectOptionalItems(cats);
        setOptionalItems(items);
        setIncluded(loadIncludedState(scenarioId, items));
      })
      .catch((err) => {
        console.error(err);
        setError("Erro ao carregar dados da analise.");
      })
      .finally(() => setLoading(false));
  }, [id, scenarioId]);

  // --- Toggle optional item inclusion ---
  const toggleItem = useCallback(
    (itemId: number) => {
      setIncluded((prev) => {
        const next = { ...prev, [itemId]: !prev[itemId] };
        saveIncludedState(scenarioId, next);
        return next;
      });
    },
    [scenarioId],
  );

  // --- Adjusted totals accounting for excluded optional items ---
  const adjustedTotals = useMemo(() => {
    if (!summary) {
      return {
        revenuesBudgeted: 0,
        revenuesRealized: 0,
        revenuesEstimated: 0,
        expensesBudgeted: 0,
        expensesRealized: 0,
        expensesEstimated: 0,
      };
    }

    let revEstDelta = 0;
    let revBudDelta = 0;
    let revReaDelta = 0;
    let expEstDelta = 0;
    let expBudDelta = 0;
    let expReaDelta = 0;

    for (const item of optionalItems) {
      if (!included[item.itemId]) {
        if (item.itemType === "revenue") {
          revEstDelta += item.estimatedValue;
          revBudDelta += item.budgetedValue;
          revReaDelta += item.realizedValue;
        } else {
          expEstDelta += item.estimatedValue;
          expBudDelta += item.budgetedValue;
          expReaDelta += item.realizedValue;
        }
      }
    }

    return {
      revenuesBudgeted: summary.total_revenues_budgeted - revBudDelta,
      revenuesRealized: summary.total_revenues_realized - revReaDelta,
      revenuesEstimated: summary.total_revenues_estimated - revEstDelta,
      expensesBudgeted: summary.total_expenses_budgeted - expBudDelta,
      expensesRealized: summary.total_expenses_realized - expReaDelta,
      expensesEstimated: summary.total_expenses_estimated - expEstDelta,
    };
  }, [summary, optionalItems, included]);

  const balanceBudgeted =
    adjustedTotals.revenuesBudgeted - adjustedTotals.expensesBudgeted;
  const balanceRealized =
    adjustedTotals.revenuesRealized - adjustedTotals.expensesRealized;
  const balanceEstimated =
    adjustedTotals.revenuesEstimated - adjustedTotals.expensesEstimated;

  const isDeficit = adjustedTotals.expensesEstimated > adjustedTotals.revenuesEstimated;

  // --- Correction percentages ---
  const correctionPrevista =
    adjustedTotals.expensesBudgeted !== 0
      ? ((adjustedTotals.expensesEstimated - adjustedTotals.expensesBudgeted) /
          adjustedTotals.expensesBudgeted) *
        100
      : 0;

  // Ideal correction: what % increase on revenues is needed so that
  // adjusted revenues_estimated == adjusted expenses_estimated
  const correctionIdeal =
    adjustedTotals.revenuesBudgeted !== 0
      ? ((adjustedTotals.expensesEstimated - adjustedTotals.revenuesBudgeted) /
          adjustedTotals.revenuesBudgeted) *
        100
      : 0;

  // --- Tax simulation ---
  const lotSizes = parameters
    ? [
        parameters.lot_simulation_1,
        parameters.lot_simulation_2,
        parameters.lot_simulation_3,
      ]
    : [];

  function computeMonthlyTax(
    totalRevenues: number,
    totalSqm: number,
    lotSize: number,
  ): number {
    if (totalSqm === 0) return 0;
    return (totalRevenues / totalSqm) * lotSize / 12;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">Carregando...</div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center text-red-500">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Analise de Viabilidade Orcamentaria
          </h1>
          {scenario && (
            <p className="text-sm text-gray-500">
              {scenario.name} - {scenario.year}
            </p>
          )}
        </div>
      </div>

      {/* Section 1 - Status Alert */}
      <Card
        className={cn(
          "border-0",
          isDeficit
            ? "bg-red-50 dark:bg-red-950"
            : "bg-green-50 dark:bg-green-950",
        )}
      >
        <CardContent className="flex items-center gap-3 py-4">
          {isDeficit ? (
            <>
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-800">
                  Orcamento em Deficit
                </p>
                <p className="text-sm text-red-600">
                  As despesas estimadas superam as receitas em{" "}
                  {formatCurrency(Math.abs(balanceEstimated))}
                </p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">
                  Orcamento Equilibrado
                </p>
                <p className="text-sm text-green-600">
                  As receitas estimadas cobrem as despesas com saldo de{" "}
                  {formatCurrency(balanceEstimated)}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 2 - Financial Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Receitas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receitas</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Orcado (ano base)</td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrency(adjustedTotals.revenuesBudgeted)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Realizado (ano base)</td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrency(adjustedTotals.revenuesRealized)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-500">Estimado (prox. ano)</td>
                  <td className="py-2 text-right font-semibold">
                    {formatCurrency(adjustedTotals.revenuesEstimated)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Despesas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Orcado (ano base)</td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrency(adjustedTotals.expensesBudgeted)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Realizado (ano base)</td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrency(adjustedTotals.expensesRealized)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-500">Estimado (prox. ano)</td>
                  <td className="py-2 text-right font-semibold">
                    {formatCurrency(adjustedTotals.expensesEstimated)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Saldo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Orcado (ano base)</td>
                  <td
                    className={cn(
                      "py-2 text-right font-medium",
                      balanceBudgeted >= 0 ? "text-green-600" : "text-red-600",
                    )}
                  >
                    {formatCurrency(balanceBudgeted)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-500">Realizado (ano base)</td>
                  <td
                    className={cn(
                      "py-2 text-right font-medium",
                      balanceRealized >= 0 ? "text-green-600" : "text-red-600",
                    )}
                  >
                    {formatCurrency(balanceRealized)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-500">Estimado (prox. ano)</td>
                  <td
                    className={cn(
                      "py-2 text-right font-semibold",
                      balanceEstimated >= 0 ? "text-green-600" : "text-red-600",
                    )}
                  >
                    {formatCurrency(balanceEstimated)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Section 3 - Optional Items */}
      {optionalItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Itens Opcionais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-gray-500">
              Marque ou desmarque itens opcionais para recalcular os totais da
              analise.
            </p>
            <div className="space-y-2">
              {optionalItems.map((item) => (
                <label
                  key={item.itemId}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!!included[item.itemId]}
                    onChange={() => toggleItem(item.itemId)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.name}</span>
                      <Badge
                        variant={
                          item.itemType === "revenue" ? "default" : "secondary"
                        }
                        className="text-xs"
                      >
                        {item.itemType === "revenue" ? "Receita" : "Despesa"}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-400">
                      {item.categoryName}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium whitespace-nowrap",
                      item.itemType === "revenue"
                        ? "text-green-600"
                        : "text-red-600",
                    )}
                  >
                    {formatCurrency(item.estimatedValue)}
                  </span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 4 - Correction Percentages */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Correcao Prevista</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatPercent(correctionPrevista)}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Variacao entre o orcado e o estimado das despesas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Correcao Ideal</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-3xl font-bold",
                correctionIdeal > 0 ? "text-red-600" : "text-green-600",
              )}
            >
              {formatPercent(correctionIdeal)}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Percentual necessario sobre a receita base para equilibrar o
              orcamento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section 5 - Tax Simulation */}
      {parameters && parameters.total_square_meters > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Simulacao de Taxa de Manutencao</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-gray-500">
              Area total do condominio:{" "}
              <span className="font-medium text-gray-700">
                {parameters.total_square_meters.toLocaleString("pt-BR")} m2
              </span>
              {" | "}Desconto habite-se:{" "}
              <span className="font-medium text-gray-700">
                {formatPercent(parameters.habite_se_discount)}
              </span>
            </p>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {lotSizes.map((lotSize, idx) => {
                if (lotSize <= 0) return null;

                const taxBase = computeMonthlyTax(
                  adjustedTotals.revenuesBudgeted,
                  parameters.total_square_meters,
                  lotSize,
                );
                const taxPrevisto = computeMonthlyTax(
                  adjustedTotals.revenuesEstimated,
                  parameters.total_square_meters,
                  lotSize,
                );

                // Ideal: revenues need to cover expenses exactly
                const taxIdeal = computeMonthlyTax(
                  adjustedTotals.expensesEstimated,
                  parameters.total_square_meters,
                  lotSize,
                );

                const discountFactor =
                  1 - parameters.habite_se_discount / 100;

                return (
                  <div key={idx} className="rounded-lg border p-4">
                    <h4 className="mb-3 text-center font-semibold">
                      Lote {lotSize.toLocaleString("pt-BR")} m2
                    </h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left text-gray-500 font-normal">
                            &nbsp;
                          </th>
                          <th className="py-2 text-right text-gray-500 font-normal">
                            Sem desconto
                          </th>
                          <th className="py-2 text-right text-gray-500 font-normal">
                            Com habite-se
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="py-2 text-gray-600">Base</td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(taxBase)}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(taxBase * discountFactor)}
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-2 text-gray-600">Previsto</td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(taxPrevisto)}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(taxPrevisto * discountFactor)}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-gray-600 font-semibold">
                            Ideal
                          </td>
                          <td className="py-2 text-right font-semibold text-red-600">
                            {formatCurrency(taxIdeal)}
                          </td>
                          <td className="py-2 text-right font-semibold text-red-600">
                            {formatCurrency(taxIdeal * discountFactor)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
