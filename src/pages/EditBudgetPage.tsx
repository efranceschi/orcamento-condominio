import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import {
  getScenario,
  listCategories,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  createValue,
  updateValue,
} from "../lib/api";
import { Button } from "../components/ui/button";
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
import { cn, formatCurrency } from "../lib/utils";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FileText,
  Plus,
  Save,
  Trash2,
  ArrowLeft,
  Search,
  X,
} from "lucide-react";
import type {
  BudgetScenario,
  BudgetCategory,
  BudgetItem,
  BudgetValue,
} from "../types";

// ---------------------------------------------------------------------------
// Row-level editing state for the center panel
// ---------------------------------------------------------------------------
interface RowEditState {
  itemId: number;
  name: string;
  budgeted: string;
  realized: string;
  adjusted: string;
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// Detail panel form state
// ---------------------------------------------------------------------------
interface DetailForm {
  name: string;
  budgeted: string;
  realized: string;
  adjusted: string;
  adjustmentPercent: string;
  estimatedFixed: string;
  repeatsNextBudget: boolean;
  isOptional: boolean;
  observations: string;
}

function buildDetailForm(item: BudgetItem): DetailForm {
  const v = item.values[0] as BudgetValue | undefined;
  return {
    name: item.name,
    budgeted: v ? String(v.budgeted) : "0",
    realized: v?.realized != null ? String(v.realized) : "",
    adjusted: v?.adjusted != null ? String(v.adjusted) : "",
    adjustmentPercent:
      item.adjustment_percent != null ? String(item.adjustment_percent) : "",
    estimatedFixed:
      v?.estimated_fixed != null ? String(v.estimated_fixed) : "",
    repeatsNextBudget: item.repeats_next_budget,
    isOptional: item.is_optional,
    observations: item.observations ?? "",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function countItems(cat: BudgetCategory): number {
  let count = cat.items.length;
  for (const sub of cat.subcategories) {
    count += countItems(sub);
  }
  return count;
}

function matchesSearch(cat: BudgetCategory, term: string): boolean {
  if (cat.name.toLowerCase().includes(term)) return true;
  return cat.subcategories.some((sub) => matchesSearch(sub, term));
}

function parseNum(val: string): number | null {
  if (val.trim() === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function EditBudgetPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Core data
  const [scenario, setScenario] = useState<BudgetScenario | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Left panel
  const [activeTab, setActiveTab] = useState<"despesa" | "receita">("despesa");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  );

  // Center panel
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [rowEdits, setRowEdits] = useState<Map<number, RowEditState>>(
    new Map(),
  );
  const [loadingItems, setLoadingItems] = useState(false);
  const [savingRowId, setSavingRowId] = useState<number | null>(null);

  // Right panel
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [detailForm, setDetailForm] = useState<DetailForm | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);

  // Add-item dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemBudgeted, setNewItemBudgeted] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<BudgetItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const readOnly = scenario?.is_closed ?? false;

  // ------------------------------------------
  // Data loading
  // ------------------------------------------
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [sc, cats] = await Promise.all([
        getScenario(Number(id)),
        listCategories(Number(id)),
      ]);
      setScenario(sc);
      setCategories(cats);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load items when a category is selected
  const loadItems = useCallback(async (categoryId: number) => {
    setLoadingItems(true);
    try {
      const its = await listItems(categoryId);
      setItems(its);
      // Build initial row edit state
      const edits = new Map<number, RowEditState>();
      for (const it of its) {
        if (it.id == null) continue;
        const v = it.values[0] as BudgetValue | undefined;
        edits.set(it.id, {
          itemId: it.id,
          name: it.name,
          budgeted: v ? String(v.budgeted) : "0",
          realized: v?.realized != null ? String(v.realized) : "",
          adjusted: v?.adjusted != null ? String(v.adjusted) : "",
          dirty: false,
        });
      }
      setRowEdits(edits);
    } catch (err) {
      console.error("Erro ao carregar itens:", err);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCategoryId != null) {
      loadItems(selectedCategoryId);
      // Clear right panel on category switch
      setSelectedItem(null);
      setDetailForm(null);
    }
  }, [selectedCategoryId, loadItems]);

  // ------------------------------------------
  // Category tree helpers
  // ------------------------------------------
  const toggleExpand = (catId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  const selectCategory = (cat: BudgetCategory) => {
    if (cat.id == null) return;
    setSelectedCategoryId(cat.id);
  };

  // Filter categories by tab and search
  const filteredCategories = categories
    .filter((c) => c.item_type === activeTab)
    .filter((c) => {
      if (!searchTerm.trim()) return true;
      return matchesSearch(c, searchTerm.toLowerCase());
    });

  // ------------------------------------------
  // Row inline edit
  // ------------------------------------------
  const updateRowField = (
    itemId: number,
    field: keyof Pick<RowEditState, "budgeted" | "realized" | "adjusted">,
    value: string,
  ) => {
    setRowEdits((prev) => {
      const next = new Map(prev);
      const row = next.get(itemId);
      if (!row) return prev;
      next.set(itemId, { ...row, [field]: value, dirty: true });
      return next;
    });
  };

  const saveRow = async (item: BudgetItem) => {
    if (item.id == null) return;
    const row = rowEdits.get(item.id);
    if (!row) return;

    setSavingRowId(item.id);
    try {
      const v = item.values[0] as BudgetValue | undefined;
      const budgeted = parseNum(row.budgeted) ?? 0;
      const realized = parseNum(row.realized);
      const adjusted = parseNum(row.adjusted);

      if (v && v.id != null) {
        await updateValue(v.id, { budgeted, realized, adjusted });
      } else {
        await createValue({
          item_id: item.id,
          budgeted,
          realized,
          adjusted,
        });
      }

      // Refresh items
      if (selectedCategoryId != null) {
        await loadItems(selectedCategoryId);
      }

      // If this item is also selected in the detail panel, refresh it
      if (selectedItem?.id === item.id) {
        const refreshedItems = await listItems(item.category_id);
        const refreshed = refreshedItems.find((i) => i.id === item.id);
        if (refreshed) {
          setSelectedItem(refreshed);
          setDetailForm(buildDetailForm(refreshed));
        }
      }
    } catch (err) {
      console.error("Erro ao salvar:", err);
    } finally {
      setSavingRowId(null);
    }
  };

  // ------------------------------------------
  // Delete item
  // ------------------------------------------
  const confirmDelete = async () => {
    if (!deleteTarget || deleteTarget.id == null) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteItem(deleteTarget.id);
      if (selectedItem?.id === deleteTarget.id) {
        setSelectedItem(null);
        setDetailForm(null);
      }
      if (selectedCategoryId != null) {
        await loadItems(selectedCategoryId);
      }
    } catch (err) {
      console.error("Erro ao excluir:", err);
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  // ------------------------------------------
  // Add item
  // ------------------------------------------
  const handleAddItem = async () => {
    if (!newItemName.trim() || selectedCategoryId == null) return;
    setCreatingItem(true);
    try {
      const budgeted = parseNum(newItemBudgeted);
      await createItem({
        category_id: selectedCategoryId,
        name: newItemName.trim(),
        budgeted,
      });
      setAddDialogOpen(false);
      setNewItemName("");
      setNewItemBudgeted("");
      await loadItems(selectedCategoryId);
      // Also refresh categories so item counts update
      if (id) {
        const cats = await listCategories(Number(id));
        setCategories(cats);
      }
    } catch (err) {
      console.error("Erro ao criar item:", err);
    } finally {
      setCreatingItem(false);
    }
  };

  // ------------------------------------------
  // Detail panel
  // ------------------------------------------
  const selectItemForDetail = (item: BudgetItem) => {
    setSelectedItem(item);
    setDetailForm(buildDetailForm(item));
  };

  const updateDetailField = <K extends keyof DetailForm>(
    field: K,
    value: DetailForm[K],
  ) => {
    setDetailForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const saveDetail = async () => {
    if (!selectedItem || selectedItem.id == null || !detailForm) return;
    setSavingDetail(true);
    try {
      // Update item fields
      await updateItem(selectedItem.id, {
        name: detailForm.name,
        adjustment_percent: parseNum(detailForm.adjustmentPercent),
        repeats_next_budget: detailForm.repeatsNextBudget,
        is_optional: detailForm.isOptional,
        observations: detailForm.observations || null,
      });

      // Update value fields
      const v = selectedItem.values[0] as BudgetValue | undefined;
      const budgeted = parseNum(detailForm.budgeted) ?? 0;
      const realized = parseNum(detailForm.realized);
      const adjusted = parseNum(detailForm.adjusted);
      const estimatedFixed = parseNum(detailForm.estimatedFixed);

      if (v && v.id != null) {
        await updateValue(v.id, {
          budgeted,
          realized,
          adjusted,
          estimated_fixed: estimatedFixed,
        });
      } else {
        await createValue({
          item_id: selectedItem.id,
          budgeted,
          realized,
          adjusted,
          estimated_fixed: estimatedFixed,
        });
      }

      // Reload
      if (selectedCategoryId != null) {
        const its = await listItems(selectedCategoryId);
        setItems(its);
        const refreshed = its.find((i) => i.id === selectedItem.id);
        if (refreshed) {
          setSelectedItem(refreshed);
          setDetailForm(buildDetailForm(refreshed));
        }

        // Rebuild row edits
        const edits = new Map<number, RowEditState>();
        for (const it of its) {
          if (it.id == null) continue;
          const val = it.values[0] as BudgetValue | undefined;
          edits.set(it.id, {
            itemId: it.id,
            name: it.name,
            budgeted: val ? String(val.budgeted) : "0",
            realized: val?.realized != null ? String(val.realized) : "",
            adjusted: val?.adjusted != null ? String(val.adjusted) : "",
            dirty: false,
          });
        }
        setRowEdits(edits);
      }
    } catch (err) {
      console.error("Erro ao salvar detalhes:", err);
    } finally {
      setSavingDetail(false);
    }
  };

  const cancelDetail = () => {
    if (selectedItem) {
      setDetailForm(buildDetailForm(selectedItem));
    }
  };

  // ------------------------------------------
  // Category tree renderer
  // ------------------------------------------
  function renderCategoryTree(cats: BudgetCategory[], depth: number = 0) {
    return cats.map((cat) => {
      if (cat.id == null) return null;
      const hasChildren = cat.subcategories.length > 0;
      const isExpanded = expandedIds.has(cat.id);
      const isActive = selectedCategoryId === cat.id;
      const itemCount = countItems(cat);

      // Check if this category or its children match search
      if (
        searchTerm.trim() &&
        !matchesSearch(cat, searchTerm.toLowerCase())
      ) {
        return null;
      }

      return (
        <div key={cat.id}>
          <button
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100",
              isActive && "bg-blue-50 text-blue-700 font-medium",
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (hasChildren) toggleExpand(cat.id!);
              selectCategory(cat);
            }}
          >
            {/* Expand/collapse chevron */}
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              )
            ) : (
              <span className="w-4 shrink-0" />
            )}

            {/* Icon */}
            {hasChildren ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
            )}

            {/* Name */}
            <span className="flex-1 truncate">{cat.name}</span>

            {/* Count badge */}
            {itemCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {itemCount}
              </Badge>
            )}
          </button>

          {/* Children */}
          {hasChildren && isExpanded && (
            <div>
              {renderCategoryTree(cat.subcategories, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }

  // ------------------------------------------
  // Find selected category name
  // ------------------------------------------
  function findCategory(
    cats: BudgetCategory[],
    targetId: number,
  ): BudgetCategory | null {
    for (const c of cats) {
      if (c.id === targetId) return c;
      const found = findCategory(c.subcategories, targetId);
      if (found) return found;
    }
    return null;
  }

  const selectedCategory =
    selectedCategoryId != null
      ? findCategory(categories, selectedCategoryId)
      : null;

  // ------------------------------------------
  // Loading state
  // ------------------------------------------
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Carregando...
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Cenario nao encontrado.
      </div>
    );
  }

  // ------------------------------------------
  // Render
  // ------------------------------------------
  return (
    <div className="flex h-full flex-col -m-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-gray-900">
          {scenario.name}
        </h1>
        {readOnly && (
          <Badge variant="warning" className="ml-2">
            Somente leitura
          </Badge>
        )}
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ========== LEFT PANEL ========== */}
        <aside className="flex w-[250px] shrink-0 flex-col border-r bg-white">
          {/* Scenario info */}
          <div className="border-b px-3 py-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Cenario
            </p>
            <p className="text-sm font-semibold text-gray-800 truncate">
              {scenario.name}
            </p>
            <p className="text-xs text-gray-400">{scenario.year}</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b">
            <button
              className={cn(
                "flex-1 py-2 text-sm font-medium transition-colors",
                activeTab === "despesa"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700",
              )}
              onClick={() => setActiveTab("despesa")}
            >
              Despesas
            </button>
            <button
              className={cn(
                "flex-1 py-2 text-sm font-medium transition-colors",
                activeTab === "receita"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700",
              )}
              onClick={() => setActiveTab("receita")}
            >
              Receitas
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {searchTerm && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category tree */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {filteredCategories.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-gray-400">
                Nenhuma categoria encontrada
              </p>
            ) : (
              renderCategoryTree(filteredCategories)
            )}
          </div>
        </aside>

        {/* ========== CENTER PANEL ========== */}
        <main className="flex-1 overflow-y-auto bg-white">
          {selectedCategory == null ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <div className="text-center">
                <FolderOpen className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2 text-sm">Selecione uma categoria</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">
                    {selectedCategory.name}
                  </h2>
                  {selectedCategory.code && (
                    <p className="text-xs text-gray-400">
                      Codigo: {selectedCategory.code}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setNewItemName("");
                      setNewItemBudgeted("");
                      setAddDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar Item
                  </Button>
                )}
              </div>

              {/* Items table */}
              <div className="flex-1 overflow-y-auto">
                {loadingItems ? (
                  <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                    Carregando itens...
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <FileText className="h-10 w-10 text-gray-300" />
                    <p className="mt-2 text-sm">
                      Nenhum item nesta categoria
                    </p>
                    {!readOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setNewItemName("");
                          setNewItemBudgeted("");
                          setAddDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar primeiro item
                      </Button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5">Nome</th>
                        <th className="px-4 py-2.5 w-36">Orcado (R$)</th>
                        <th className="px-4 py-2.5 w-36">Realizado (R$)</th>
                        <th className="px-4 py-2.5 w-36">Proposto (R$)</th>
                        <th className="px-4 py-2.5 w-24 text-center">
                          Acoes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item) => {
                        if (item.id == null) return null;
                        const row = rowEdits.get(item.id);
                        if (!row) return null;
                        const isSaving = savingRowId === item.id;
                        const isSelected = selectedItem?.id === item.id;

                        return (
                          <tr
                            key={item.id}
                            className={cn(
                              "hover:bg-gray-50 transition-colors",
                              isSelected && "bg-blue-50/50",
                              row.dirty && "bg-amber-50/40",
                            )}
                          >
                            {/* Nome */}
                            <td className="px-4 py-2">
                              <button
                                className="text-left text-sm text-gray-800 hover:text-blue-600 hover:underline truncate max-w-[200px] block"
                                onClick={() => selectItemForDetail(item)}
                                title={item.name}
                              >
                                {item.name}
                                {item.is_optional && (
                                  <Badge
                                    variant="outline"
                                    className="ml-2 text-[10px] px-1 py-0"
                                  >
                                    Opcional
                                  </Badge>
                                )}
                              </button>
                            </td>

                            {/* Orcado */}
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 text-sm"
                                value={row.budgeted}
                                disabled={readOnly}
                                onChange={(e) =>
                                  updateRowField(
                                    item.id!,
                                    "budgeted",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>

                            {/* Realizado */}
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 text-sm"
                                value={row.realized}
                                disabled={readOnly}
                                onChange={(e) =>
                                  updateRowField(
                                    item.id!,
                                    "realized",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>

                            {/* Proposto */}
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 text-sm"
                                value={row.adjusted}
                                disabled={readOnly}
                                onChange={(e) =>
                                  updateRowField(
                                    item.id!,
                                    "adjusted",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>

                            {/* Acoes */}
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={
                                    readOnly || !row.dirty || isSaving
                                  }
                                  onClick={() => saveRow(item)}
                                  title="Salvar"
                                >
                                  <Save
                                    className={cn(
                                      "h-4 w-4",
                                      row.dirty
                                        ? "text-blue-600"
                                        : "text-gray-400",
                                    )}
                                  />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={readOnly}
                                  onClick={() => setDeleteTarget(item)}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer summary */}
              {items.length > 0 && (
                <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
                  {items.length} {items.length === 1 ? "item" : "itens"} | Total
                  orcado:{" "}
                  {formatCurrency(
                    items.reduce((sum, it) => {
                      const v = it.values[0] as BudgetValue | undefined;
                      return sum + (v?.budgeted ?? 0);
                    }, 0),
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* ========== RIGHT PANEL ========== */}
        {selectedItem && detailForm && (
          <aside className="w-[300px] shrink-0 overflow-y-auto border-l bg-gray-50">
            <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Detalhes do Item
              </h3>
              <button
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                onClick={() => {
                  setSelectedItem(null);
                  setDetailForm(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nome
                </label>
                <Input
                  value={detailForm.name}
                  disabled={readOnly}
                  onChange={(e) => updateDetailField("name", e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Orcado */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Orcado (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={detailForm.budgeted}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateDetailField("budgeted", e.target.value)
                  }
                  className="text-sm"
                />
              </div>

              {/* Realizado */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Realizado (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={detailForm.realized}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateDetailField("realized", e.target.value)
                  }
                  className="text-sm"
                />
              </div>

              {/* Proposto */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Proposto (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={detailForm.adjusted}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateDetailField("adjusted", e.target.value)
                  }
                  className="text-sm"
                />
              </div>

              {/* Ajuste */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Ajuste (%)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={detailForm.adjustmentPercent}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateDetailField("adjustmentPercent", e.target.value)
                  }
                  className="text-sm"
                />
              </div>

              {/* Estimado Fixo */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Estimado Fixo (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={detailForm.estimatedFixed}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateDetailField("estimatedFixed", e.target.value)
                  }
                  className="text-sm"
                />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!detailForm.repeatsNextBudget}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateDetailField(
                        "repeatsNextBudget",
                        !e.target.checked,
                      )
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Nao se repete no proximo orcamento
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={detailForm.isOptional}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateDetailField("isOptional", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Item opcional
                </label>
              </div>

              {/* Observacoes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Observacoes
                </label>
                <Textarea
                  value={detailForm.observations}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateDetailField("observations", e.target.value)
                  }
                  className="text-sm min-h-[80px]"
                  rows={3}
                />
              </div>

              {/* Action buttons */}
              {!readOnly && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={savingDetail}
                    onClick={saveDetail}
                  >
                    <Save className="h-4 w-4" />
                    {savingDetail ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={cancelDetail}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ========== ADD ITEM DIALOG ========== */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setAddDialogOpen(false)}>
            <DialogTitle>Adicionar Item</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria
              </label>
              <Input
                value={selectedCategory?.name ?? ""}
                disabled
                className="text-sm bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Nome do item"
                className="text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor orcado inicial (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                value={newItemBudgeted}
                onChange={(e) => setNewItemBudgeted(e.target.value)}
                placeholder="0,00"
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={creatingItem}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddItem}
              disabled={!newItemName.trim() || creatingItem}
            >
              <Plus className="h-4 w-4" />
              {creatingItem ? "Criando..." : "Criar Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== DELETE CONFIRMATION DIALOG ========== */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader onClose={() => setDeleteTarget(null)}>
            <DialogTitle>Confirmar Exclusao</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-gray-600">
            Tem certeza que deseja excluir o item{" "}
            <strong>{deleteTarget?.name}</strong>? Esta acao nao pode ser
            desfeita.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deletingId !== null}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletingId !== null}
            >
              <Trash2 className="h-4 w-4" />
              {deletingId !== null ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
