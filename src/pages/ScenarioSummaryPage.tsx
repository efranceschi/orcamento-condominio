import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Progress } from "../components/ui/progress";
import { cn, formatCurrency, formatPercent, getUsageColor } from "../lib/utils";
import { getScenario, getScenarioSummary, updateCategory } from "../lib/api";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type {
  BudgetScenario,
  ScenarioSummary,
  CategorySummary,
} from "../types";

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

const EXPENSE_COLOR = "#ef4444";
const REVENUE_COLOR = "#10b981";

const GREEN_SHADES = [
  "#10b981",
  "#059669",
  "#047857",
  "#065f46",
  "#064e3b",
  "#34d399",
  "#6ee7b7",
  "#a7f3d0",
];

// Additional colors available for future charts
// const CHART_COLORS = [
//   "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
//   "#14b8a6", "#f97316", "#6366f1", "#84cc16",
// ];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenCategories(cats: CategorySummary[]): CategorySummary[] {
  const result: CategorySummary[] = [];
  for (const cat of cats) {
    result.push(cat);
    if (cat.subcategories?.length) {
      result.push(...flattenCategories(cat.subcategories));
    }
  }
  return result;
}

function getGaugeColor(percent: number): string {
  if (percent > 90) return "#ef4444";
  if (percent >= 75) return "#f59e0b";
  return "#10b981";
}

function getGaugeLabel(percent: number): string {
  if (percent > 90) return "Acima do limite";
  if (percent >= 75) return "Atenção";
  return "Dentro do orçamento";
}

// Custom tooltip for charts
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScenarioSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const [scenario, setScenario] = useState<BudgetScenario | null>(null);
  const [summary, setSummary] = useState<ScenarioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Adjustment edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CategorySummary | null>(null);
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [scenarioData, summaryData] = await Promise.all([
        getScenario(Number(id)),
        getScenarioSummary(Number(id)),
      ]);
      setScenario(scenarioData);
      setSummary(summaryData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openAdjustmentModal = (cat: CategorySummary) => {
    setEditingCategory(cat);
    setAdjustmentValue("");
    setEditModalOpen(true);
  };

  const handleSaveAdjustment = async () => {
    if (!editingCategory) return;
    setSaving(true);
    try {
      await updateCategory(editingCategory.category_id, {
        adjustment_percent: Number(adjustmentValue) || 0,
      });
      setEditModalOpen(false);
      await loadData();
    } catch (err) {
      alert(`Erro ao salvar ajuste: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Loading / Error states ----------

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">Carregando...</div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!summary || !scenario) {
    return (
      <div className="py-12 text-center text-gray-500">
        Dados do resumo não encontrados.
      </div>
    );
  }

  // ---------- Derived data ----------

  const topLevelCategories = summary.categories;
  const allCategories = flattenCategories(topLevelCategories);

  const revenueCategories = topLevelCategories.filter(
    (c) => c.item_type === "revenue",
  );

  // Section 2: Receitas vs Despesas doughnut
  const revenueVsExpenseData = [
    { name: "Receitas", value: summary.total_revenues_budgeted },
    { name: "Despesas", value: summary.total_expenses_budgeted },
  ];
  const revenueVsExpenseColors = [REVENUE_COLOR, EXPENSE_COLOR];

  // Section 3: Revenue breakdown doughnut
  const revenueBreakdownData = revenueCategories.map((c) => ({
    name: c.name,
    value: c.total_budgeted,
  }));

  // Section 4: Budget execution gauge
  const totalBudgeted =
    summary.total_expenses_budgeted + summary.total_revenues_budgeted;
  const totalRealized =
    summary.total_expenses_realized + summary.total_revenues_realized;
  const executionPercent =
    totalBudgeted > 0
      ? Math.round((totalRealized / totalBudgeted) * 100)
      : 0;
  const gaugeColor = getGaugeColor(executionPercent);
  const gaugeLabel = getGaugeLabel(executionPercent);
  const gaugeData = [
    { name: "Executado", value: executionPercent },
    { name: "Restante", value: Math.max(0, 100 - executionPercent) },
  ];

  // Section 5: Problematic expenses (realized > budgeted)
  const problematicExpenses = allCategories.filter(
    (c) =>
      c.item_type === "expense" &&
      c.total_budgeted > 0 &&
      c.total_realized > c.total_budgeted,
  );
  const problematicBarData = problematicExpenses.map((c) => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + "..." : c.name,
    fullName: c.name,
    Orçado: c.total_budgeted,
    Realizado: c.total_realized,
  }));

  // Section 6: Savings opportunities (realized < budgeted)
  const savingsCategories = allCategories.filter(
    (c) =>
      c.item_type === "expense" &&
      c.total_budgeted > 0 &&
      c.total_realized < c.total_budgeted &&
      c.total_realized > 0,
  );
  const totalSavings = savingsCategories.reduce(
    (sum, c) => sum + (c.total_budgeted - c.total_realized),
    0,
  );
  const totalSavingsRealized = savingsCategories.reduce(
    (sum, c) => sum + c.total_realized,
    0,
  );
  const savingsDoughnutData = [
    { name: "Economia", value: totalSavings },
    { name: "Realizado", value: totalSavingsRealized },
  ];

  return (
    <div>
      {/* ================================================================ */}
      {/* Header                                                           */}
      {/* ================================================================ */}
      <div className="mb-6 flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            {scenario.name} - Resumo
          </h1>
          <Badge variant="outline">{scenario.year}</Badge>
          {scenario.is_baseline && <Badge variant="default">Base</Badge>}
          {scenario.is_approved && <Badge variant="success">Aprovado</Badge>}
          {scenario.is_closed && <Badge variant="warning">Fechado</Badge>}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Section 1 — Stat Cards                                           */}
      {/* ================================================================ */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Despesas */}
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">
                  Total Despesas
                </p>
                <p className="mt-1 text-2xl font-bold text-red-700">
                  {formatCurrency(summary.total_expenses_budgeted)}
                </p>
              </div>
              <div className="rounded-full bg-red-100 p-3">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-red-600">
              <span>
                Realizado: {formatCurrency(summary.total_expenses_realized)}
              </span>
              <span>
                Estimado: {formatCurrency(summary.total_expenses_estimated)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Receitas */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">
                  Total Receitas
                </p>
                <p className="mt-1 text-2xl font-bold text-green-700">
                  {formatCurrency(summary.total_revenues_budgeted)}
                </p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-green-600">
              <span>
                Realizado: {formatCurrency(summary.total_revenues_realized)}
              </span>
              <span>
                Estimado: {formatCurrency(summary.total_revenues_estimated)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Saldo */}
        <Card
          className={cn(
            summary.balance_budgeted >= 0
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    summary.balance_budgeted >= 0
                      ? "text-green-600"
                      : "text-red-600",
                  )}
                >
                  Saldo
                </p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-bold",
                    summary.balance_budgeted >= 0
                      ? "text-green-700"
                      : "text-red-700",
                  )}
                >
                  {formatCurrency(summary.balance_budgeted)}
                </p>
              </div>
              <div
                className={cn(
                  "rounded-full p-3",
                  summary.balance_budgeted >= 0
                    ? "bg-green-100"
                    : "bg-red-100",
                )}
              >
                <DollarSign
                  className={cn(
                    "h-6 w-6",
                    summary.balance_budgeted >= 0
                      ? "text-green-600"
                      : "text-red-600",
                  )}
                />
              </div>
            </div>
            <div
              className={cn(
                "mt-3 flex gap-4 text-xs",
                summary.balance_budgeted >= 0
                  ? "text-green-600"
                  : "text-red-600",
              )}
            >
              <span>
                Realizado: {formatCurrency(summary.balance_realized)}
              </span>
              <span>
                Estimado: {formatCurrency(summary.balance_estimated)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* Section 2 & 3 — Doughnut Charts Row                             */}
      {/* ================================================================ */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Section 2 — Receitas vs Despesas */}
        <Card>
          <CardHeader>
            <CardTitle>Receitas vs Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueVsExpenseData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    stroke="none"
                  >
                    {revenueVsExpenseData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={revenueVsExpenseColors[index]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<ChartTooltip />}
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value: string) => (
                      <span className="text-sm text-gray-700">{value}</span>
                    )}
                  />
                  {/* Center text */}
                  <text
                    x="50%"
                    y="46%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-gray-900 text-sm font-bold"
                  >
                    {formatCurrency(
                      summary.total_revenues_budgeted +
                        summary.total_expenses_budgeted,
                    )}
                  </text>
                  <text
                    x="50%"
                    y="54%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-gray-500 text-xs"
                  >
                    Total
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Section 3 — Revenue Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Composição das Receitas</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueBreakdownData.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Nenhuma categoria de receita encontrada.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueBreakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      stroke="none"
                    >
                      {revenueBreakdownData.map((_, index) => (
                        <Cell
                          key={`rev-cell-${index}`}
                          fill={GREEN_SHADES[index % GREEN_SHADES.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      formatter={(value: string) => (
                        <span className="text-sm text-gray-700">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* Section 4 — Gauge Chart: Budget Execution                        */}
      {/* ================================================================ */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Execução Orçamentária</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <div className="h-52 w-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gaugeData}
                      cx="50%"
                      cy="85%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={80}
                      outerRadius={120}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill={gaugeColor} />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                    <text
                      x="50%"
                      y="70%"
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-gray-900 text-2xl font-bold"
                    >
                      {executionPercent}%
                    </text>
                    <text
                      x="50%"
                      y="82%"
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-gray-500 text-xs"
                    >
                      {gaugeLabel}
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex gap-6 text-sm text-gray-600">
                <span>
                  Orçado: <strong>{formatCurrency(totalBudgeted)}</strong>
                </span>
                <span>
                  Realizado: <strong>{formatCurrency(totalRealized)}</strong>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* Section 5 — Problematic Expenses                                 */}
      {/* ================================================================ */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Despesas Problemáticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {problematicExpenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Nenhuma despesa acima do orçado. Parabéns!
              </p>
            ) : (
              <>
                {/* Bar Chart */}
                <div className="mb-6 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={problematicBarData}
                      margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-20}
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
                        formatter={(value: unknown, name: unknown) => [
                          formatCurrency(Number(value)),
                          String(name),
                        ]}
                        labelFormatter={(label: unknown) => {
                          const labelStr = String(label);
                          const item = problematicBarData.find(
                            (d) => d.name === labelStr,
                          );
                          return item?.fullName ?? labelStr;
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="Orçado"
                        fill="#93c5fd"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="Realizado"
                        fill="#ef4444"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Detail list */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="pb-2 pr-4 font-medium">Categoria</th>
                        <th className="pb-2 pr-4 text-right font-medium">
                          Orçado
                        </th>
                        <th className="pb-2 pr-4 text-right font-medium">
                          Realizado
                        </th>
                        <th className="pb-2 pr-4 text-right font-medium">
                          Excedente
                        </th>
                        <th className="pb-2 text-right font-medium">
                          Excedente %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {problematicExpenses.map((cat) => {
                        const overrun = cat.total_realized - cat.total_budgeted;
                        const overrunPct =
                          cat.total_budgeted > 0
                            ? (overrun / cat.total_budgeted) * 100
                            : 0;
                        return (
                          <tr
                            key={cat.category_id}
                            className="border-b border-gray-100"
                          >
                            <td className="py-2 pr-4 font-medium text-gray-900">
                              {cat.name}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-600">
                              {formatCurrency(cat.total_budgeted)}
                            </td>
                            <td className="py-2 pr-4 text-right font-medium text-red-600">
                              {formatCurrency(cat.total_realized)}
                            </td>
                            <td className="py-2 pr-4 text-right font-medium text-red-600">
                              {formatCurrency(overrun)}
                            </td>
                            <td className="py-2 text-right">
                              <Badge variant="destructive">
                                +{formatPercent(overrunPct)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* Section 6 — Savings Opportunities                                */}
      {/* ================================================================ */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-500" />
              Oportunidades de Economia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {savingsCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Nenhuma oportunidade de economia identificada.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Savings doughnut */}
                <div className="flex items-center justify-center">
                  <div className="h-64 w-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={savingsDoughnutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={85}
                          dataKey="value"
                          stroke="none"
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#d1d5db" />
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          verticalAlign="bottom"
                          formatter={(value: string) => (
                            <span className="text-sm text-gray-700">
                              {value}
                            </span>
                          )}
                        />
                        <text
                          x="50%"
                          y="46%"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="fill-green-700 text-sm font-bold"
                        >
                          {formatCurrency(totalSavings)}
                        </text>
                        <text
                          x="50%"
                          y="54%"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="fill-gray-500 text-xs"
                        >
                          Economia total
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Savings list */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="pb-2 pr-4 font-medium">Categoria</th>
                        <th className="pb-2 pr-4 text-right font-medium">
                          Orçado
                        </th>
                        <th className="pb-2 pr-4 text-right font-medium">
                          Realizado
                        </th>
                        <th className="pb-2 pr-4 text-right font-medium">
                          Economia
                        </th>
                        <th className="pb-2 text-right font-medium">
                          Economia %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {savingsCategories.map((cat) => {
                        const saved =
                          cat.total_budgeted - cat.total_realized;
                        const savedPct =
                          cat.total_budgeted > 0
                            ? (saved / cat.total_budgeted) * 100
                            : 0;
                        return (
                          <tr
                            key={cat.category_id}
                            className="border-b border-gray-100"
                          >
                            <td className="py-2 pr-4 font-medium text-gray-900">
                              {cat.name}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-600">
                              {formatCurrency(cat.total_budgeted)}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-600">
                              {formatCurrency(cat.total_realized)}
                            </td>
                            <td className="py-2 pr-4 text-right font-medium text-green-600">
                              {formatCurrency(saved)}
                            </td>
                            <td className="py-2 text-right">
                              <Badge variant="success">
                                {formatPercent(savedPct)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* Section 7 — Category Table                                       */}
      {/* ================================================================ */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-2 pr-4 font-medium">Nome</th>
                    <th className="pb-2 pr-4 font-medium">Tipo</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Ajuste (%)
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Orçado
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Realizado
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Estimado
                    </th>
                    <th className="pb-2 font-medium" style={{ minWidth: 140 }}>
                      Utilização
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allCategories.map((cat) => {
                    const utilization =
                      cat.total_budgeted > 0
                        ? Math.round(
                            (cat.total_realized / cat.total_budgeted) * 100,
                          )
                        : 0;
                    const usageColorClass = getUsageColor(utilization);
                    const bgColor = usageColorClass.includes("red")
                      ? "bg-red-500"
                      : usageColorClass.includes("orange")
                        ? "bg-orange-500"
                        : "bg-green-500";

                    return (
                      <tr
                        key={cat.category_id}
                        className="border-b border-gray-100"
                      >
                        <td className="py-2.5 pr-4">
                          <span className="font-medium text-gray-900">
                            {cat.code ? `${cat.code} - ` : ""}
                            {cat.name}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge
                            variant={
                              cat.item_type === "expense"
                                ? "destructive"
                                : "success"
                            }
                          >
                            {cat.item_type === "expense"
                              ? "Despesa"
                              : "Receita"}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <button
                            onClick={() => openAdjustmentModal(cat)}
                            className="cursor-pointer rounded px-2 py-0.5 text-blue-600 underline decoration-dashed underline-offset-4 hover:bg-blue-50 hover:text-blue-800"
                            title="Clique para editar ajuste"
                          >
                            {formatPercent(cat.variance_percent)}
                          </button>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">
                          {formatCurrency(cat.total_budgeted)}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">
                          {formatCurrency(cat.total_realized)}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">
                          {formatCurrency(cat.total_estimated)}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={utilization}
                              colorClass={bgColor}
                              className="flex-1"
                            />
                            <span
                              className={cn(
                                "min-w-[3rem] text-right text-xs font-medium",
                                usageColorClass,
                              )}
                            >
                              {utilization}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* Adjustment Edit Modal                                            */}
      {/* ================================================================ */}
      <Dialog open={editModalOpen} onClose={() => setEditModalOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setEditModalOpen(false)}>
            <DialogTitle>Editar Ajuste</DialogTitle>
          </DialogHeader>

          {editingCategory && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Categoria</p>
                <p className="font-medium text-gray-900">
                  {editingCategory.name}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Percentual de Ajuste (%)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustmentValue}
                  onChange={(e) => setAdjustmentValue(e.target.value)}
                  placeholder="Ex: 5.50"
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  Informe o percentual de ajuste para esta categoria. Use valores
                  negativos para redução.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveAdjustment} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
