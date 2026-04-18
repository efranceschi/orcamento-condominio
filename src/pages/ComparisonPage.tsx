import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listScenarios, getScenarioSummary } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { cn, formatCurrency, formatPercent } from "../lib/utils";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type {
  BudgetScenario,
  ScenarioSummary,
  CategorySummary,
} from "../types";

function safeDivPercent(diff: number, base: number): number {
  if (base === 0) return 0;
  return (diff / Math.abs(base)) * 100;
}

export default function ComparisonPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [scenarios, setScenarios] = useState<BudgetScenario[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedA, setSelectedA] = useState<string>(
    searchParams.get("a") ?? "",
  );
  const [selectedB, setSelectedB] = useState<string>(
    searchParams.get("b") ?? "",
  );

  const [summaryA, setSummaryA] = useState<ScenarioSummary | null>(null);
  const [summaryB, setSummaryB] = useState<ScenarioSummary | null>(null);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load scenarios list
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await listScenarios();
        setScenarios(data);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load summaries when both selected
  useEffect(() => {
    if (!selectedA || !selectedB) {
      setSummaryA(null);
      setSummaryB(null);
      return;
    }

    const idA = Number(selectedA);
    const idB = Number(selectedB);

    // Update search params
    setSearchParams({ a: selectedA, b: selectedB }, { replace: true });

    (async () => {
      try {
        setLoadingSummaries(true);
        setError(null);
        const [sA, sB] = await Promise.all([
          getScenarioSummary(idA),
          getScenarioSummary(idB),
        ]);
        setSummaryA(sA);
        setSummaryB(sB);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoadingSummaries(false);
      }
    })();
  }, [selectedA, selectedB, setSearchParams]);

  const scenarioOptions = scenarios.map((s) => ({
    value: String(s.id),
    label: `${s.name} (${s.year})`,
  }));

  // Build summary comparison rows
  const summaryRows = summaryA && summaryB
    ? [
        {
          label: "Despesas (Orçado)",
          a: summaryA.total_expenses_budgeted,
          b: summaryB.total_expenses_budgeted,
        },
        {
          label: "Despesas (Estimado)",
          a: summaryA.total_expenses_estimated,
          b: summaryB.total_expenses_estimated,
        },
        {
          label: "Receitas (Orçado)",
          a: summaryA.total_revenues_budgeted,
          b: summaryB.total_revenues_budgeted,
        },
        {
          label: "Receitas (Estimado)",
          a: summaryA.total_revenues_estimated,
          b: summaryB.total_revenues_estimated,
        },
        {
          label: "Saldo (Orçado)",
          a: summaryA.balance_budgeted,
          b: summaryB.balance_budgeted,
        },
        {
          label: "Saldo (Estimado)",
          a: summaryA.balance_estimated,
          b: summaryB.balance_estimated,
        },
      ]
    : [];

  // Build chart data from categories
  const chartData =
    summaryA && summaryB
      ? buildChartData(summaryA.categories, summaryB.categories)
      : [];

  // Flatten categories for the comparison table
  const categoryRows =
    summaryA && summaryB
      ? buildCategoryRows(summaryA.categories, summaryB.categories)
      : [];

  const scenarioAName = summaryA?.scenario_name ?? "Cenário A";
  const scenarioBName = summaryB?.scenario_name ?? "Cenário B";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-gray-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            Comparação de Cenários
          </h1>
        </div>
      </div>

      {/* Scenario selectors */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Cenário A
          </label>
          <Select
            options={[
              { value: "", label: "Selecione um cenário..." },
              ...scenarioOptions,
            ]}
            value={selectedA}
            onChange={setSelectedA}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Cenário B
          </label>
          <Select
            options={[
              { value: "", label: "Selecione um cenário..." },
              ...scenarioOptions,
            ]}
            value={selectedB}
            onChange={setSelectedB}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {(loading || loadingSummaries) && (
        <div className="py-12 text-center text-gray-500">Carregando...</div>
      )}

      {/* Empty state */}
      {!loading && !loadingSummaries && (!selectedA || !selectedB) && (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16">
          <ArrowLeftRight className="mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-1 text-lg font-medium text-gray-900">
            Selecione dois cenários para comparar
          </h3>
          <p className="text-sm text-gray-500">
            Escolha um cenário em cada seletor acima.
          </p>
        </div>
      )}

      {/* Comparison results */}
      {summaryA && summaryB && !loadingSummaries && (
        <div className="space-y-6">
          {/* Summary comparison table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo Comparativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-3 pr-4 text-left font-medium text-gray-700">
                        Métrica
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">
                        {scenarioAName}
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">
                        {scenarioBName}
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">
                        Diferença
                      </th>
                      <th className="py-3 pl-4 text-right font-medium text-gray-700">
                        Diferença %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row) => {
                      const diff = row.b - row.a;
                      const diffPct = safeDivPercent(diff, row.a);
                      return (
                        <tr
                          key={row.label}
                          className="border-b border-gray-100"
                        >
                          <td className="py-3 pr-4 font-medium text-gray-900">
                            {row.label}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {formatCurrency(row.a)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {formatCurrency(row.b)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right font-medium",
                              diffColor(diff, row.label),
                            )}
                          >
                            {formatCurrency(diff)}
                          </td>
                          <td
                            className={cn(
                              "py-3 pl-4 text-right font-medium",
                              diffColor(diff, row.label),
                            )}
                          >
                            {diff >= 0 ? "+" : ""}
                            {formatPercent(diffPct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Bar chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Despesas por Categoria (Orçado)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 30, left: 20, bottom: 40 }}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        angle={-25}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) =>
                          new Intl.NumberFormat("pt-BR", {
                            notation: "compact",
                            compactDisplay: "short",
                          }).format(v)
                        }
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                      <Legend />
                      <Bar
                        dataKey="a"
                        name={scenarioAName}
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="b"
                        name={scenarioBName}
                        fill="#f97316"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category-level comparison table */}
          {categoryRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Comparação por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 pr-4 text-left font-medium text-gray-700">
                          Categoria
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-gray-700">
                          A (Orçado)
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-gray-700">
                          B (Orçado)
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-gray-700">
                          Diferença
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-gray-700">
                          A (Estimado)
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-gray-700">
                          B (Estimado)
                        </th>
                        <th className="py-3 pl-3 text-right font-medium text-gray-700">
                          Diferença
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.map((row) => {
                        const diffBudgeted = row.bBudgeted - row.aBudgeted;
                        const diffEstimated = row.bEstimated - row.aEstimated;
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-gray-100"
                          >
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  {row.name}
                                </span>
                                <Badge
                                  variant={
                                    row.itemType === "expense"
                                      ? "destructive"
                                      : "success"
                                  }
                                  className="text-[10px]"
                                >
                                  {row.itemType === "expense"
                                    ? "Despesa"
                                    : "Receita"}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right text-gray-700">
                              {formatCurrency(row.aBudgeted)}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-700">
                              {formatCurrency(row.bBudgeted)}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-3 text-right font-medium",
                                diffBudgeted < 0
                                  ? "text-green-600"
                                  : diffBudgeted > 0
                                    ? "text-red-600"
                                    : "text-gray-500",
                              )}
                            >
                              {formatCurrency(diffBudgeted)}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-700">
                              {formatCurrency(row.aEstimated)}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-700">
                              {formatCurrency(row.bEstimated)}
                            </td>
                            <td
                              className={cn(
                                "py-3 pl-3 text-right font-medium",
                                diffEstimated < 0
                                  ? "text-green-600"
                                  : diffEstimated > 0
                                    ? "text-red-600"
                                    : "text-gray-500",
                              )}
                            >
                              {formatCurrency(diffEstimated)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Returns a diff color class. For expenses, B < A (savings) is green.
 * For revenues/balance rows, higher B is better (green).
 */
function diffColor(diff: number, label: string): string {
  if (diff === 0) return "text-gray-500";
  const isExpense = label.startsWith("Despesas");
  if (isExpense) {
    return diff < 0 ? "text-green-600" : "text-red-600";
  }
  // Revenue or balance: higher is better
  return diff > 0 ? "text-green-600" : "text-red-600";
}

interface ChartPoint {
  name: string;
  a: number;
  b: number;
}

function buildChartData(
  catA: CategorySummary[],
  catB: CategorySummary[],
): ChartPoint[] {
  // Build a map of category name -> budgeted for expense categories
  const mapA = new Map<string, number>();
  for (const c of catA) {
    if (c.item_type === "expense") {
      mapA.set(c.name, c.total_budgeted);
    }
  }

  const mapB = new Map<string, number>();
  for (const c of catB) {
    if (c.item_type === "expense") {
      mapB.set(c.name, c.total_budgeted);
    }
  }

  // Union of all category names
  const allNames = new Set([...mapA.keys(), ...mapB.keys()]);
  const data: ChartPoint[] = [];
  for (const name of allNames) {
    data.push({
      name,
      a: mapA.get(name) ?? 0,
      b: mapB.get(name) ?? 0,
    });
  }

  // Sort by A value descending
  data.sort((x, y) => y.a - x.a);
  return data;
}

interface CategoryRow {
  id: string;
  name: string;
  itemType: string;
  aBudgeted: number;
  aEstimated: number;
  bBudgeted: number;
  bEstimated: number;
}

function buildCategoryRows(
  catA: CategorySummary[],
  catB: CategorySummary[],
): CategoryRow[] {
  const mapA = new Map<string, CategorySummary>();
  for (const c of catA) {
    mapA.set(c.name, c);
  }

  const mapB = new Map<string, CategorySummary>();
  for (const c of catB) {
    mapB.set(c.name, c);
  }

  const allNames = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows: CategoryRow[] = [];

  for (const name of allNames) {
    const a = mapA.get(name);
    const b = mapB.get(name);
    rows.push({
      id: `${a?.category_id ?? "none"}-${b?.category_id ?? "none"}-${name}`,
      name,
      itemType: a?.item_type ?? b?.item_type ?? "expense",
      aBudgeted: a?.total_budgeted ?? 0,
      aEstimated: a?.total_estimated ?? 0,
      bBudgeted: b?.total_budgeted ?? 0,
      bEstimated: b?.total_estimated ?? 0,
    });
  }

  // Sort expenses first, then revenues; within each group alphabetical
  rows.sort((x, y) => {
    if (x.itemType !== y.itemType) {
      return x.itemType === "expense" ? -1 : 1;
    }
    return x.name.localeCompare(y.name, "pt-BR");
  });

  return rows;
}
