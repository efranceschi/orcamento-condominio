import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getScenario,
  listCategories,
  createItem,
  updateItem,
  deleteItem,
  createValue,
  updateValue,
} from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Progress } from "../components/ui/progress";
import { cn, formatCurrency, formatPercent, getUsageColor } from "../lib/utils";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  MessageSquare,
  Search,
  ChevronsUpDown,
} from "lucide-react";
import type {
  BudgetScenario,
  BudgetCategory,
  BudgetItem,
  BudgetValue,
  CreateItemRequest,
  UpdateItemRequest,
  CreateValueRequest,
  UpdateValueRequest,
} from "../types";

// ---------------------------------------------------------------------------
// Types local to this page
// ---------------------------------------------------------------------------

type TabKey = "despesas" | "receitas";
type AdjustmentFilter = "todos" | "com_ajuste" | "sem_ajuste";

interface CategoryTotals {
  budgeted: number;
  realized: number;
  estimated: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** localStorage key for expand/collapse state */
function storageKey(scenarioId: number, tab: TabKey): string {
  return `scenario_${scenarioId}_${tab}_expanded`;
}

function loadExpandedState(scenarioId: number, tab: TabKey): Set<number> {
  try {
    const raw = localStorage.getItem(storageKey(scenarioId, tab));
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    /* ignore */
  }
  return new Set<number>();
}

function saveExpandedState(
  scenarioId: number,
  tab: TabKey,
  expanded: Set<number>,
): void {
  try {
    localStorage.setItem(
      storageKey(scenarioId, tab),
      JSON.stringify([...expanded]),
    );
  } catch {
    /* ignore */
  }
}

/** Recursively compute totals for a category including subcategories */
function computeTotals(category: BudgetCategory): CategoryTotals {
  let budgeted = 0;
  let realized = 0;
  let estimated = 0;

  for (const item of category.items) {
    const v = item.values[0];
    if (v) {
      budgeted += v.budgeted ?? 0;
      realized += v.realized ?? 0;
      estimated += v.estimated ?? 0;
    }
  }

  for (const sub of category.subcategories) {
    const subTotals = computeTotals(sub);
    budgeted += subTotals.budgeted;
    realized += subTotals.realized;
    estimated += subTotals.estimated;
  }

  return { budgeted, realized, estimated };
}

/** Collect all category IDs (including subcategories) */
function collectCategoryIds(categories: BudgetCategory[]): number[] {
  const ids: number[] = [];
  for (const cat of categories) {
    if (cat.id != null) ids.push(cat.id);
    ids.push(...collectCategoryIds(cat.subcategories));
  }
  return ids;
}

/** Check if a category (or its subcategories/items) matches a search query */
function categoryMatchesSearch(
  category: BudgetCategory,
  query: string,
): boolean {
  const q = query.toLowerCase();
  if (category.name.toLowerCase().includes(q)) return true;
  for (const item of category.items) {
    if (item.name.toLowerCase().includes(q)) return true;
  }
  for (const sub of category.subcategories) {
    if (categoryMatchesSearch(sub, q)) return true;
  }
  return false;
}

/** Check if an item matches the adjustment filter */
function itemMatchesAdjustmentFilter(
  item: BudgetItem,
  filter: AdjustmentFilter,
): boolean {
  if (filter === "todos") return true;
  const hasAdjustment =
    item.effective_adjustment_percent != null &&
    item.effective_adjustment_percent !== 0;
  return filter === "com_ajuste" ? hasAdjustment : !hasAdjustment;
}

/** Check if a category has items matching the adjustment filter (recursive) */
function categoryMatchesAdjustmentFilter(
  category: BudgetCategory,
  filter: AdjustmentFilter,
): boolean {
  if (filter === "todos") return true;
  for (const item of category.items) {
    if (itemMatchesAdjustmentFilter(item, filter)) return true;
  }
  for (const sub of category.subcategories) {
    if (categoryMatchesAdjustmentFilter(sub, filter)) return true;
  }
  return false;
}

/** Parse a number from an input string; returns 0 for empty/NaN */
function parseNumericInput(value: string): number {
  if (!value.trim()) return 0;
  const parsed = parseFloat(value.replace(",", "."));
  return isNaN(parsed) ? 0 : parsed;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScenarioDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scenarioId = Number(id);

  // Data state
  const [scenario, setScenario] = useState<BudgetScenario | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>("despesas");
  const [searchQuery, setSearchQuery] = useState("");
  const [adjustmentFilter, setAdjustmentFilter] =
    useState<AdjustmentFilter>("todos");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Item create/edit modal
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [itemCategoryId, setItemCategoryId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formBudgeted, setFormBudgeted] = useState("");
  const [formRealized, setFormRealized] = useState("");
  const [formAdjustment, setFormAdjustment] = useState("");
  const [formEstimatedFixed, setFormEstimatedFixed] = useState("");
  const [formRepeatsNext, setFormRepeatsNext] = useState(true);
  const [formIsOptional, setFormIsOptional] = useState(false);
  const [formObservations, setFormObservations] = useState("");
  const [saving, setSaving] = useState(false);

  // Observation modal
  const [obsModalOpen, setObsModalOpen] = useState(false);
  const [obsItem, setObsItem] = useState<BudgetItem | null>(null);
  const [obsText, setObsText] = useState("");
  const [savingObs, setSavingObs] = useState(false);

  // Delete confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<BudgetItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!scenarioId || isNaN(scenarioId)) return;
    try {
      setLoading(true);
      setError(null);
      const [scenarioData, categoriesData] = await Promise.all([
        getScenario(scenarioId),
        listCategories(scenarioId),
      ]);
      setScenario(scenarioData);
      setCategories(categoriesData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load expand/collapse state from localStorage when tab or scenario changes
  useEffect(() => {
    if (!scenarioId || isNaN(scenarioId)) return;
    setExpandedIds(loadExpandedState(scenarioId, activeTab));
  }, [scenarioId, activeTab]);

  // -----------------------------------------------------------------------
  // Expand / Collapse
  // -----------------------------------------------------------------------

  const toggleExpanded = useCallback(
    (categoryId: number) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(categoryId)) {
          next.delete(categoryId);
        } else {
          next.add(categoryId);
        }
        saveExpandedState(scenarioId, activeTab, next);
        return next;
      });
    },
    [scenarioId, activeTab],
  );

  const expandAll = useCallback(() => {
    const allIds = collectCategoryIds(filteredCategories);
    const next = new Set(allIds);
    setExpandedIds(next);
    saveExpandedState(scenarioId, activeTab, next);
  }, [scenarioId, activeTab, categories, activeTab, searchQuery, adjustmentFilter]);

  const collapseAll = useCallback(() => {
    const next = new Set<number>();
    setExpandedIds(next);
    saveExpandedState(scenarioId, activeTab, next);
  }, [scenarioId, activeTab]);

  // -----------------------------------------------------------------------
  // Filter categories by tab, search, and adjustment
  // -----------------------------------------------------------------------

  const tabItemType = activeTab === "despesas" ? "despesa" : "receita";

  const filteredCategories = useMemo(() => {
    let cats = categories.filter(
      (c) =>
        c.parent_category_id === null &&
        c.item_type.toLowerCase() === tabItemType,
    );

    if (searchQuery.trim()) {
      cats = cats.filter((c) => categoryMatchesSearch(c, searchQuery));
    }

    if (adjustmentFilter !== "todos") {
      cats = cats.filter((c) =>
        categoryMatchesAdjustmentFilter(c, adjustmentFilter),
      );
    }

    return cats;
  }, [categories, tabItemType, searchQuery, adjustmentFilter]);

  // -----------------------------------------------------------------------
  // Item CRUD
  // -----------------------------------------------------------------------

  const openCreateItemModal = (categoryId: number) => {
    setEditingItem(null);
    setItemCategoryId(categoryId);
    setFormName("");
    setFormBudgeted("");
    setFormRealized("");
    setFormAdjustment("");
    setFormEstimatedFixed("");
    setFormRepeatsNext(true);
    setFormIsOptional(false);
    setFormObservations("");
    setItemModalOpen(true);
  };

  const openEditItemModal = (item: BudgetItem) => {
    const v = item.values[0];
    setEditingItem(item);
    setItemCategoryId(item.category_id);
    setFormName(item.name);
    setFormBudgeted(v ? String(v.budgeted ?? "") : "");
    setFormRealized(v?.realized != null ? String(v.realized) : "");
    setFormAdjustment(
      item.adjustment_percent != null ? String(item.adjustment_percent) : "",
    );
    setFormEstimatedFixed(
      v?.estimated_fixed != null ? String(v.estimated_fixed) : "",
    );
    setFormRepeatsNext(item.repeats_next_budget);
    setFormIsOptional(item.is_optional);
    setFormObservations(item.observations ?? "");
    setItemModalOpen(true);
  };

  const handleSaveItem = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingItem && editingItem.id != null) {
        // Update existing item
        const updateReq: UpdateItemRequest = {
          name: formName,
          adjustment_percent:
            formAdjustment.trim() !== ""
              ? parseNumericInput(formAdjustment)
              : null,
          repeats_next_budget: formRepeatsNext,
          is_optional: formIsOptional,
          observations: formObservations || null,
        };
        await updateItem(editingItem.id, updateReq);

        // Update value if it exists
        const v = editingItem.values[0];
        if (v && v.id != null) {
          const valueReq: UpdateValueRequest = {
            budgeted: parseNumericInput(formBudgeted),
            realized:
              formRealized.trim() !== ""
                ? parseNumericInput(formRealized)
                : null,
            estimated_fixed:
              formEstimatedFixed.trim() !== ""
                ? parseNumericInput(formEstimatedFixed)
                : null,
          };
          await updateValue(v.id, valueReq);
        } else {
          // Create a new value for existing item
          const valueReq: CreateValueRequest = {
            item_id: editingItem.id,
            budgeted: parseNumericInput(formBudgeted),
            realized:
              formRealized.trim() !== ""
                ? parseNumericInput(formRealized)
                : null,
            estimated_fixed:
              formEstimatedFixed.trim() !== ""
                ? parseNumericInput(formEstimatedFixed)
                : null,
          };
          await createValue(valueReq);
        }
      } else {
        // Create new item
        const request: CreateItemRequest = {
          category_id: itemCategoryId!,
          name: formName,
          adjustment_percent:
            formAdjustment.trim() !== ""
              ? parseNumericInput(formAdjustment)
              : null,
          repeats_next_budget: formRepeatsNext,
          is_optional: formIsOptional,
          observations: formObservations || null,
          budgeted: parseNumericInput(formBudgeted),
          realized:
            formRealized.trim() !== ""
              ? parseNumericInput(formRealized)
              : null,
        };
        await createItem(request);
      }
      setItemModalOpen(false);
      await loadData();
    } catch (err) {
      alert(`Erro ao salvar item: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Observation modal
  // -----------------------------------------------------------------------

  const openObsModal = (item: BudgetItem) => {
    setObsItem(item);
    setObsText(item.observations ?? "");
    setObsModalOpen(true);
  };

  const handleSaveObs = async () => {
    if (!obsItem || obsItem.id == null) return;
    setSavingObs(true);
    try {
      await updateItem(obsItem.id, { observations: obsText || null });
      setObsModalOpen(false);
      await loadData();
    } catch (err) {
      alert(`Erro ao salvar observação: ${err}`);
    } finally {
      setSavingObs(false);
    }
  };

  // -----------------------------------------------------------------------
  // Delete confirmation
  // -----------------------------------------------------------------------

  const openDeleteModal = (item: BudgetItem) => {
    setDeletingItem(item);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem || deletingItem.id == null) return;
    setDeleting(true);
    try {
      await deleteItem(deletingItem.id);
      setDeleteModalOpen(false);
      setDeletingItem(null);
      await loadData();
    } catch (err) {
      alert(`Erro ao excluir item: ${err}`);
    } finally {
      setDeleting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  /** Get the progress bar color class from a usage percent */
  const getProgressColor = (usedPercent: number | null | undefined): string => {
    const pct = usedPercent ?? 0;
    const colorClass = getUsageColor(pct);
    if (colorClass.includes("red")) return "bg-red-500";
    if (colorClass.includes("orange")) return "bg-orange-500";
    return "bg-green-500";
  };

  /** Render an individual item row */
  const renderItemRow = (item: BudgetItem, depth: number) => {
    const v: BudgetValue | undefined = item.values[0];
    const budgeted = v?.budgeted ?? 0;
    const realized = v?.realized ?? 0;
    const usedPercent = v?.used_percent ?? 0;
    const estimated = v?.estimated ?? 0;
    const effectiveAdj = item.effective_adjustment_percent ?? 0;
    const riskMargin = scenario?.risk_margin ?? 0;
    const isClosed = scenario?.is_closed ?? false;

    // Filter by search
    if (
      searchQuery.trim() &&
      !item.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return null;
    }

    // Filter by adjustment
    if (!itemMatchesAdjustmentFilter(item, adjustmentFilter)) {
      return null;
    }

    return (
      <tr
        key={`item-${item.id}`}
        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
      >
        {/* Name */}
        <td className="py-2.5 pr-3" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-900">{item.name}</span>
            {item.is_optional && (
              <span title="Item opcional" className="text-xs">
                *
              </span>
            )}
            {!item.repeats_next_budget && (
              <span
                title="Não se repete no próximo orçamento"
                className="text-xs text-red-400"
              >
                NR
              </span>
            )}
          </div>
        </td>

        {/* Orçado */}
        <td className="px-3 py-2.5 text-right">
          <span
            className={cn(
              "text-sm tabular-nums",
              budgeted === 0 ? "text-red-500" : "text-gray-900",
            )}
          >
            {formatCurrency(budgeted)}
          </span>
        </td>

        {/* Realizado */}
        <td className="px-3 py-2.5 text-right">
          <span
            className={cn(
              "text-sm tabular-nums",
              realized > budgeted ? "text-red-500 font-medium" : "text-gray-700",
            )}
          >
            {formatCurrency(realized)}
          </span>
        </td>

        {/* Utilizado */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Progress
              value={Math.min(usedPercent, 100)}
              colorClass={getProgressColor(usedPercent)}
              className="h-2 w-16"
            />
            <span
              className={cn(
                "text-xs tabular-nums font-medium",
                getUsageColor(usedPercent),
              )}
            >
              {formatPercent(usedPercent, 1)}
            </span>
          </div>
        </td>

        {/* Ajuste + Margem */}
        <td className="px-3 py-2.5 text-center">
          <span className="text-sm tabular-nums text-gray-700">
            {effectiveAdj.toFixed(1)}% + {riskMargin.toFixed(1)}M
          </span>
        </td>

        {/* Estimado */}
        <td className="px-3 py-2.5 text-right">
          <span className="text-sm tabular-nums text-gray-900">
            {formatCurrency(estimated)}
          </span>
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => openObsModal(item)}
              className={cn(
                "rounded p-1 transition-colors hover:bg-gray-200",
                item.observations
                  ? "text-blue-500"
                  : "text-gray-400",
              )}
              title={item.observations ? "Ver/Editar observação" : "Adicionar observação"}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            {!isClosed && (
              <>
                <button
                  onClick={() => openEditItemModal(item)}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                  title="Editar item"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => openDeleteModal(item)}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
                  title="Excluir item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  /** Render a category row (header) and its children recursively */
  const renderCategory = (
    category: BudgetCategory,
    depth: number,
  ): React.ReactNode => {
    const catId = category.id;
    if (catId == null) return null;

    const isExpanded = expandedIds.has(catId);
    const totals = computeTotals(category);
    const hasChildren =
      category.subcategories.length > 0 || category.items.length > 0;

    return (
      <React.Fragment key={`cat-${catId}`}>
        {/* Category header row */}
        <tr
          className={cn(
            "border-b border-gray-200 transition-colors",
            depth === 0
              ? "bg-gray-100/80 hover:bg-gray-100"
              : "bg-gray-50/60 hover:bg-gray-50",
          )}
        >
          <td
            colSpan={1}
            className="py-2.5 pr-3 cursor-pointer select-none"
            style={{ paddingLeft: `${depth * 24 + 8}px` }}
            onClick={() => toggleExpanded(catId)}
          >
            <div className="flex items-center gap-2">
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-500" />
                )
              ) : (
                <span className="w-4" />
              )}
              <span
                className={cn(
                  "font-medium",
                  depth === 0 ? "text-sm text-gray-900" : "text-sm text-gray-700",
                )}
              >
                {category.code ? `${category.code} - ` : ""}
                {category.name}
              </span>
            </div>
          </td>

          {/* Subtotal Orçado */}
          <td className="px-3 py-2.5 text-right">
            <span className="text-sm font-medium tabular-nums text-gray-900">
              {formatCurrency(totals.budgeted)}
            </span>
          </td>

          {/* Subtotal Realizado */}
          <td className="px-3 py-2.5 text-right">
            <span className="text-sm font-medium tabular-nums text-gray-700">
              {formatCurrency(totals.realized)}
            </span>
          </td>

          {/* Utilizado - empty for category */}
          <td className="px-3 py-2.5" />

          {/* Ajuste - empty for category */}
          <td className="px-3 py-2.5" />

          {/* Subtotal Estimado */}
          <td className="px-3 py-2.5 text-right">
            <span className="text-sm font-medium tabular-nums text-gray-900">
              {formatCurrency(totals.estimated)}
            </span>
          </td>

          {/* Actions - Add item button for categories */}
          <td className="px-3 py-2.5">
            <div className="flex justify-end">
              {!scenario?.is_closed && category.subcategories.length === 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreateItemModal(catId);
                  }}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
                  title="Adicionar item nesta categoria"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </td>
        </tr>

        {/* Expanded children */}
        {isExpanded && (
          <>
            {category.items.map((item) => renderItemRow(item, depth + 1))}
            {category.subcategories.map((sub) =>
              renderCategory(sub, depth + 1),
            )}
          </>
        )}
      </React.Fragment>
    );
  };

  // -----------------------------------------------------------------------
  // Loading / Error states
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">Carregando...</div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <div className="mx-auto max-w-md rounded-md bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={loadData}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="py-12 text-center text-gray-500">
        Cenário não encontrado.
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {scenario.name}
            </h1>
            <p className="text-sm text-gray-500">Ano {scenario.year}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scenario.is_baseline && <Badge variant="default">Base</Badge>}
          {!scenario.is_baseline && (
            <Badge variant="secondary">Simulação</Badge>
          )}
          {scenario.is_approved && <Badge variant="success">Aprovado</Badge>}
          {scenario.is_closed && <Badge variant="warning">Fechado</Badge>}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex border-b border-gray-200">
        {(
          [
            ["despesas", "Despesas"],
            ["receitas", "Receitas"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={expandAll}>
          <ChevronsUpDown className="h-3.5 w-3.5" />
          Expandir Tudo
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          <ChevronsUpDown className="h-3.5 w-3.5 rotate-90" />
          Recolher Tudo
        </Button>

        {!scenario.is_closed && (
          <Button
            size="sm"
            onClick={() => {
              // Find the first leaf category in the active tab to add an item
              const leafCat = filteredCategories.find(
                (c) => c.subcategories.length === 0,
              );
              if (leafCat && leafCat.id != null) {
                openCreateItemModal(leafCat.id);
              } else if (filteredCategories.length > 0) {
                alert(
                  "Selecione uma categoria sem subcategorias para adicionar um item. Use o botão + na categoria desejada.",
                );
              } else {
                alert(
                  "Nenhuma categoria encontrada. Crie categorias antes de adicionar itens.",
                );
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar Item
          </Button>
        )}

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar itens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        <div className="flex rounded-md border border-gray-300">
          {(
            [
              ["todos", "Todos"],
              ["com_ajuste", "Com Ajuste"],
              ["sem_ajuste", "Sem Ajuste"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setAdjustmentFilter(key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md",
                adjustmentFilter === key
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Categories table */}
      <Card>
        <CardContent className="p-0">
          {filteredCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-gray-500">
                {searchQuery.trim()
                  ? "Nenhum resultado encontrado para a busca."
                  : "Nenhuma categoria encontrada para esta aba."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Nome
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-32">
                      Orçado (R$)
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-32">
                      Realizado (R$)
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-36">
                      Utilizado (%)
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 w-32">
                      Ajuste+Margem
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-32">
                      Estimado (R$)
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-24">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((cat) => renderCategory(cat, 0))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Item Create / Edit Modal                                          */}
      {/* ================================================================= */}
      <Dialog open={itemModalOpen} onClose={() => setItemModalOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setItemModalOpen(false)}>
            <DialogTitle>
              {editingItem ? "Editar Item" : "Novo Item"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nome *
              </label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome do item"
              />
            </div>

            {/* Orçado */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Orçado (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                value={formBudgeted}
                onChange={(e) => setFormBudgeted(e.target.value)}
                placeholder="0,00"
              />
            </div>

            {/* Realizado */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Realizado (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                value={formRealized}
                onChange={(e) => setFormRealized(e.target.value)}
                placeholder="Opcional"
              />
            </div>

            {/* Row: Ajuste + Estimado Fixo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Ajuste (%)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formAdjustment}
                  onChange={(e) => setFormAdjustment(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Estimado fixo (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formEstimatedFixed}
                  onChange={(e) => setFormEstimatedFixed(e.target.value)}
                  placeholder="Opcional (sobrescreve cálculo)"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="repeatsNext"
                  checked={!formRepeatsNext}
                  onChange={(e) => setFormRepeatsNext(!e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="repeatsNext"
                  className="text-sm text-gray-700"
                >
                  Não se repete no próximo orçamento
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isOptional"
                  checked={formIsOptional}
                  onChange={(e) => setFormIsOptional(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="isOptional"
                  className="text-sm text-gray-700"
                >
                  Item opcional
                </label>
              </div>
            </div>

            {/* Observations */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Observações
              </label>
              <Textarea
                value={formObservations}
                onChange={(e) => setFormObservations(e.target.value)}
                placeholder="Observações opcionais..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveItem}
              disabled={saving || !formName.trim()}
            >
              {saving ? "Salvando..." : editingItem ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Observation Modal                                                  */}
      {/* ================================================================= */}
      <Dialog open={obsModalOpen} onClose={() => setObsModalOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setObsModalOpen(false)}>
            <DialogTitle>
              Observação — {obsItem?.name}
            </DialogTitle>
          </DialogHeader>

          <div>
            <Textarea
              value={obsText}
              onChange={(e) => setObsText(e.target.value)}
              placeholder="Escreva uma observação..."
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setObsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveObs} disabled={savingObs}>
              {savingObs ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Delete Confirmation Modal                                          */}
      {/* ================================================================= */}
      <Dialog open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setDeleteModalOpen(false)}>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-gray-700">
            Tem certeza que deseja excluir o item{" "}
            <strong>"{deletingItem?.name}"</strong>? Esta ação não pode ser
            desfeita.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
