import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FileText,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { cn, formatPercent } from "../lib/utils";
import {
  listScenarios,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategory,
} from "../lib/api";
import type {
  BudgetScenario,
  BudgetCategory,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPANDED_STORAGE_KEY = "categories_expanded";

function loadExpandedState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExpandedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

/** Count total items recursively in a category and its subcategories. */
function countItems(cat: BudgetCategory): number {
  let total = cat.items.length;
  for (const sub of cat.subcategories) {
    total += countItems(sub);
  }
  return total;
}

/** Collect all category ids from a tree. */
function collectIds(cats: BudgetCategory[]): number[] {
  const ids: number[] = [];
  for (const cat of cats) {
    if (cat.id != null) ids.push(cat.id);
    ids.push(...collectIds(cat.subcategories));
  }
  return ids;
}

/** Flatten categories into a list of { id, name, depth } for parent dropdown. */
function flattenForSelect(
  cats: BudgetCategory[],
  depth: number = 0,
): { id: number; name: string; depth: number }[] {
  const result: { id: number; name: string; depth: number }[] = [];
  for (const cat of cats) {
    if (cat.id != null) {
      result.push({ id: cat.id, name: cat.name, depth });
      result.push(...flattenForSelect(cat.subcategories, depth + 1));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Toast component (lightweight in-page notification)
// ---------------------------------------------------------------------------

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error";
}

let toastCounter = 0;

function ToastContainer({ messages, onDismiss }: { messages: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-3 text-sm font-medium shadow-lg transition-all",
            msg.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white",
          )}
        >
          <span className="flex-1">{msg.text}</span>
          <button
            onClick={() => onDismiss(msg.id)}
            className="ml-2 rounded p-0.5 hover:bg-white/20"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryTreeNode
// ---------------------------------------------------------------------------

interface CategoryTreeNodeProps {
  category: BudgetCategory;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: number) => void;
  onEdit: (cat: BudgetCategory) => void;
  onDelete: (cat: BudgetCategory) => void;
  onMoveUp: (cat: BudgetCategory) => void;
  onMoveDown: (cat: BudgetCategory) => void;
  isFirst: boolean;
  isLast: boolean;
  searchQuery: string;
}

function categoryMatchesSearch(cat: BudgetCategory, query: string): boolean {
  const q = query.toLowerCase();
  if (cat.name.toLowerCase().includes(q)) return true;
  if (cat.code && cat.code.toLowerCase().includes(q)) return true;
  for (const sub of cat.subcategories) {
    if (categoryMatchesSearch(sub, query)) return true;
  }
  return false;
}

function CategoryTreeNode({
  category,
  depth,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  searchQuery,
}: CategoryTreeNodeProps) {
  if (searchQuery && !categoryMatchesSearch(category, searchQuery)) {
    return null;
  }

  const hasChildren = category.subcategories.length > 0;
  const isExpanded = expanded[String(category.id)] ?? false;
  const isLeaf = !hasChildren;
  const itemCount = countItems(category);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-gray-50",
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {/* Expand / collapse toggle */}
        <button
          onClick={() => category.id != null && onToggle(category.id)}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-200",
            !hasChildren && "invisible",
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Icon */}
        {isLeaf ? (
          <FileText className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
        )}

        {/* Name */}
        <span className="truncate text-sm font-medium text-gray-800">
          {category.code ? `${category.code} - ` : ""}
          {category.name}
        </span>

        {/* Item count */}
        <span className="shrink-0 text-xs text-gray-400">
          ({itemCount})
        </span>

        {/* Adjustment badge */}
        {category.adjustment_percent != null && category.adjustment_percent !== 0 && (
          <Badge
            variant={category.adjustment_percent > 0 ? "warning" : "success"}
            className="shrink-0"
          >
            {formatPercent(category.adjustment_percent)}
          </Badge>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons (visible on hover) */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onMoveUp(category)}
            disabled={isFirst}
            title="Mover para cima"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onMoveDown(category)}
            disabled={isLast}
            title="Mover para baixo"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onEdit(category)}
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => onDelete(category)}
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Subcategories */}
      {hasChildren && isExpanded && (
        <div>
          {category.subcategories
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((sub, idx, arr) => (
              <CategoryTreeNode
                key={sub.id}
                category={sub}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                isFirst={idx === 0}
                isLast={idx === arr.length - 1}
                searchQuery={searchQuery}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type TabType = "expense" | "revenue";

export default function CategoriesPage() {
  // Data
  const [scenarios, setScenarios] = useState<BudgetScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>("expense");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpandedState);
  const [searchQuery, setSearchQuery] = useState("");

  // Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: "success" | "error") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Dialog - create / edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<TabType>("expense");
  const [formParentId, setFormParentId] = useState<string>("");
  const [formAdjustment, setFormAdjustment] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Dialog - delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<BudgetCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadScenarios = useCallback(async () => {
    try {
      setLoadingScenarios(true);
      const data = await listScenarios();
      setScenarios(data);
    } catch (err) {
      showToast(`Erro ao carregar cenarios: ${err}`, "error");
    } finally {
      setLoadingScenarios(false);
    }
  }, [showToast]);

  const loadCategories = useCallback(async () => {
    if (!selectedScenarioId) return;
    try {
      setLoading(true);
      const data = await listCategories(Number(selectedScenarioId));
      setCategories(data);
    } catch (err) {
      showToast(`Erro ao carregar categorias: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [selectedScenarioId, showToast]);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  useEffect(() => {
    if (selectedScenarioId) {
      loadCategories();
    } else {
      setCategories([]);
    }
  }, [selectedScenarioId, loadCategories]);

  // Persist expanded state
  useEffect(() => {
    saveExpandedState(expanded);
  }, [expanded]);

  // ---------------------------------------------------------------------------
  // Filtered categories for active tab
  // ---------------------------------------------------------------------------

  const filteredCategories = useMemo(() => {
    return categories
      .filter((c) => c.item_type === activeTab)
      .slice()
      .sort((a, b) => a.order - b.order);
  }, [categories, activeTab]);

  /** All categories of the form's selected type, for parent dropdown. */
  const parentOptions = useMemo(() => {
    const typeToFilter = editingCategory ? editingCategory.item_type : formType;
    const filtered = categories.filter((c) => c.item_type === typeToFilter);
    const flat = flattenForSelect(filtered);
    // When editing, exclude self and descendants
    if (editingCategory && editingCategory.id != null) {
      const descendantIds = new Set(collectIds(editingCategory.subcategories));
      descendantIds.add(editingCategory.id);
      return flat.filter((f) => !descendantIds.has(f.id));
    }
    return flat;
  }, [categories, formType, editingCategory]);

  // ---------------------------------------------------------------------------
  // Expand / Collapse
  // ---------------------------------------------------------------------------

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const key = String(id);
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = collectIds(filteredCategories);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const id of allIds) {
        next[String(id)] = true;
      }
      return next;
    });
  }, [filteredCategories]);

  const collapseAll = useCallback(() => {
    const allIds = collectIds(filteredCategories);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const id of allIds) {
        next[String(id)] = false;
      }
      return next;
    });
  }, [filteredCategories]);

  // ---------------------------------------------------------------------------
  // Create / Edit
  // ---------------------------------------------------------------------------

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormName("");
    setFormDescription("");
    setFormType(activeTab);
    setFormParentId("");
    setFormAdjustment("");
    setFormCode("");
    setDialogOpen(true);
  };

  const openEditDialog = (cat: BudgetCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormDescription(cat.description ?? "");
    setFormType(cat.item_type as TabType);
    setFormParentId(cat.parent_category_id != null ? String(cat.parent_category_id) : "");
    setFormAdjustment(
      cat.adjustment_percent != null ? String(cat.adjustment_percent) : "",
    );
    setFormCode(cat.code ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    if (!selectedScenarioId) return;

    setSaving(true);
    try {
      if (editingCategory && editingCategory.id != null) {
        const request: UpdateCategoryRequest = {
          name: formName.trim(),
          description: formDescription.trim() || null,
          code: formCode.trim() || null,
          adjustment_percent:
            formAdjustment !== "" ? Number(formAdjustment) : null,
        };
        await updateCategory(editingCategory.id, request);
        showToast("Categoria atualizada com sucesso.", "success");
      } else {
        const request: CreateCategoryRequest = {
          scenario_id: Number(selectedScenarioId),
          parent_category_id: formParentId ? Number(formParentId) : null,
          name: formName.trim(),
          description: formDescription.trim() || null,
          code: formCode.trim() || null,
          item_type: formType,
          adjustment_percent:
            formAdjustment !== "" ? Number(formAdjustment) : null,
        };
        await createCategory(request);
        showToast("Categoria criada com sucesso.", "success");
      }
      setDialogOpen(false);
      await loadCategories();
    } catch (err) {
      showToast(`Erro ao salvar categoria: ${err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const openDeleteDialog = (cat: BudgetCategory) => {
    setDeletingCategory(cat);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCategory || deletingCategory.id == null) return;
    setDeleting(true);
    try {
      await deleteCategory(deletingCategory.id);
      showToast("Categoria excluida com sucesso.", "success");
      setDeleteDialogOpen(false);
      setDeletingCategory(null);
      await loadCategories();
    } catch (err) {
      showToast(`Erro ao excluir categoria: ${err}`, "error");
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reorder
  // ---------------------------------------------------------------------------

  const handleMoveUp = async (cat: BudgetCategory) => {
    if (cat.id == null) return;
    // Find siblings
    const siblings = (
      cat.parent_category_id == null
        ? categories.filter(
            (c) => c.parent_category_id == null && c.item_type === cat.item_type,
          )
        : findSiblings(categories, cat.parent_category_id)
    )
      .slice()
      .sort((a, b) => a.order - b.order);

    const idx = siblings.findIndex((s) => s.id === cat.id);
    if (idx <= 0) return;

    const prev = siblings[idx - 1];
    if (prev.id == null) return;

    try {
      // Swap orders
      await reorderCategory(cat.id, prev.order);
      await reorderCategory(prev.id, cat.order);
      await loadCategories();
    } catch (err) {
      showToast(`Erro ao reordenar: ${err}`, "error");
    }
  };

  const handleMoveDown = async (cat: BudgetCategory) => {
    if (cat.id == null) return;
    const siblings = (
      cat.parent_category_id == null
        ? categories.filter(
            (c) => c.parent_category_id == null && c.item_type === cat.item_type,
          )
        : findSiblings(categories, cat.parent_category_id)
    )
      .slice()
      .sort((a, b) => a.order - b.order);

    const idx = siblings.findIndex((s) => s.id === cat.id);
    if (idx < 0 || idx >= siblings.length - 1) return;

    const next = siblings[idx + 1];
    if (next.id == null) return;

    try {
      await reorderCategory(cat.id, next.order);
      await reorderCategory(next.id, cat.order);
      await loadCategories();
    } catch (err) {
      showToast(`Erro ao reordenar: ${err}`, "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Scenario options
  // ---------------------------------------------------------------------------

  const scenarioOptions = useMemo(
    () =>
      scenarios.map((s) => ({
        value: String(s.id),
        label: `${s.name} (${s.year})`,
      })),
    [scenarios],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasBlockers =
    deletingCategory != null &&
    (deletingCategory.subcategories.length > 0 ||
      deletingCategory.items.length > 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
      </div>

      {/* Scenario selector */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Cenario
        </label>
        {loadingScenarios ? (
          <div className="text-sm text-gray-500">Carregando cenarios...</div>
        ) : (
          <Select
            options={scenarioOptions}
            value={selectedScenarioId}
            onChange={setSelectedScenarioId}
            placeholder="Selecione um cenario"
            className="w-80"
          />
        )}
      </div>

      {!selectedScenarioId && (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">
              Selecione um cenario para visualizar as categorias.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedScenarioId && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Gerenciamento de Categorias</CardTitle>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="h-4 w-4" />
                Adicionar Categoria
              </Button>
            </div>

            {/* Tabs + toolbar */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Tabs */}
              <div className="flex rounded-md border border-gray-300">
                {(
                  [
                    ["expense", "Despesas"],
                    ["revenue", "Receitas"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      "px-4 py-2 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md",
                      activeTab === key
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Expand / Collapse */}
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expandir Tudo
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Recolher Tudo
              </Button>

              {/* Search */}
              <div className="relative flex-1" style={{ minWidth: 180 }}>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Buscar categorias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Loading */}
            {loading && (
              <div className="py-12 text-center text-gray-500">
                Carregando categorias...
              </div>
            )}

            {/* Empty state */}
            {!loading && filteredCategories.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16">
                <FolderOpen className="mb-4 h-12 w-12 text-gray-400" />
                <h3 className="mb-1 text-lg font-medium text-gray-900">
                  Nenhuma categoria encontrada
                </h3>
                <p className="mb-4 text-sm text-gray-500">
                  {activeTab === "expense"
                    ? "Adicione categorias de despesas para comecar."
                    : "Adicione categorias de receitas para comecar."}
                </p>
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" />
                  Adicionar Categoria
                </Button>
              </div>
            )}

            {/* Category tree */}
            {!loading && filteredCategories.length > 0 && (
              <div className="space-y-0.5">
                {filteredCategories.map((cat, idx) => (
                  <CategoryTreeNode
                    key={cat.id}
                    category={cat}
                    depth={0}
                    expanded={expanded}
                    onToggle={toggleExpanded}
                    onEdit={openEditDialog}
                    onDelete={openDeleteDialog}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    isFirst={idx === 0}
                    isLast={idx === filteredCategories.length - 1}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* Create / Edit Dialog                                               */}
      {/* ================================================================== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setDialogOpen(false)}>
            <DialogTitle>
              {editingCategory ? "Editar Categoria" : "Nova Categoria"}
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
                placeholder="Nome da categoria"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Descricao
              </label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descricao opcional..."
                rows={3}
              />
            </div>

            {/* Type (radio) */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Tipo
              </label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="itemType"
                    value="expense"
                    checked={formType === "expense"}
                    onChange={() => setFormType("expense")}
                    disabled={editingCategory != null}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Despesa</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="itemType"
                    value="revenue"
                    checked={formType === "revenue"}
                    onChange={() => setFormType("revenue")}
                    disabled={editingCategory != null}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Receita</span>
                </label>
              </div>
            </div>

            {/* Parent category */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Categoria Pai
              </label>
              <Select
                options={[
                  { value: "", label: "Raiz (nivel superior)" },
                  ...parentOptions.map((p) => ({
                    value: String(p.id),
                    label: `${"  ".repeat(p.depth)}${p.name}`,
                  })),
                ]}
                value={formParentId}
                onChange={setFormParentId}
                disabled={editingCategory != null}
              />
              {editingCategory != null && (
                <p className="mt-1 text-xs text-gray-400">
                  A categoria pai nao pode ser alterada apos a criacao.
                </p>
              )}
            </div>

            {/* Adjustment percent */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Percentual de Ajuste
              </label>
              <Input
                type="number"
                step="0.01"
                value={formAdjustment}
                onChange={(e) => setFormAdjustment(e.target.value)}
                placeholder="Ex: 5.5"
              />
              <p className="mt-1 text-xs text-gray-400">
                Opcional. Percentual aplicado sobre os itens desta categoria.
              </p>
            </div>

            {/* Code */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Codigo
              </label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Ex: 01.01"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim()}
            >
              {saving
                ? "Salvando..."
                : editingCategory
                  ? "Salvar"
                  : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* Delete Confirmation Dialog                                         */}
      {/* ================================================================== */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogContent>
          <DialogHeader onClose={() => setDeleteDialogOpen(false)}>
            <DialogTitle>Excluir Categoria</DialogTitle>
          </DialogHeader>

          {deletingCategory && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Tem certeza que deseja excluir a categoria{" "}
                <span className="font-semibold">
                  &quot;{deletingCategory.name}&quot;
                </span>
                ?
              </p>

              {hasBlockers && (
                <div className="flex items-start gap-2 rounded-md bg-orange-50 p-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                  <div className="text-sm text-orange-800">
                    <p className="font-medium">Atencao</p>
                    <p>
                      Esta categoria possui{" "}
                      {deletingCategory.subcategories.length > 0 && (
                        <span>
                          {deletingCategory.subcategories.length}{" "}
                          subcategoria(s)
                        </span>
                      )}
                      {deletingCategory.subcategories.length > 0 &&
                        deletingCategory.items.length > 0 &&
                        " e "}
                      {deletingCategory.items.length > 0 && (
                        <span>
                          {deletingCategory.items.length} item(ns)
                        </span>
                      )}
                      . A exclusao pode ser bloqueada pelo sistema.
                    </p>
                  </div>
                </div>
              )}

              {!hasBlockers && (
                <p className="text-sm text-gray-500">
                  Esta acao nao pode ser desfeita.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast notifications */}
      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: find siblings (subcategories of a given parent)
// ---------------------------------------------------------------------------

function findSiblings(
  categories: BudgetCategory[],
  parentId: number,
): BudgetCategory[] {
  for (const cat of categories) {
    if (cat.id === parentId) {
      return cat.subcategories;
    }
    const found = findSiblings(cat.subcategories, parentId);
    if (found.length > 0) return found;
  }
  return [];
}
