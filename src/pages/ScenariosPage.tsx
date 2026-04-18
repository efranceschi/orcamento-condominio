import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Eye,
  BarChart3,
  LineChart,
  FileDown,
  Pencil,
  Trash2,
  FileText,
  FlaskConical,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select } from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { formatPercent, formatDate } from "../lib/utils";
import {
  listScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  generatePdf,
} from "../lib/api";
import type {
  BudgetScenario,
  CreateScenarioRequest,
  UpdateScenarioRequest,
} from "../types";

const currentYear = new Date().getFullYear();

const yearOptions = Array.from({ length: 5 }, (_, i) => {
  const y = currentYear - 2 + i;
  return { value: String(y), label: String(y) };
});

type TypeFilter = "all" | "baseline" | "simulation";

export default function ScenariosPage() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<BudgetScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [yearFilter, setYearFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScenario, setEditingScenario] =
    useState<BudgetScenario | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formYear, setFormYear] = useState(String(currentYear));
  const [formDescription, setFormDescription] = useState("");
  const [formIsBaseline, setFormIsBaseline] = useState(false);
  const [formCopyPrevious, setFormCopyPrevious] = useState(false);
  const [saving, setSaving] = useState(false);

  // Simulation dialog state
  const [simDialogOpen, setSimDialogOpen] = useState(false);
  const [simBaseScenario, setSimBaseScenario] = useState<BudgetScenario | null>(
    null,
  );
  const [simName, setSimName] = useState("");
  const [simGeneralAdjustment, setSimGeneralAdjustment] = useState(0);
  const [simRiskMargin, setSimRiskMargin] = useState(0);
  const [simSaving, setSimSaving] = useState(false);

  const openSimDialog = (scenario: BudgetScenario) => {
    setSimBaseScenario(scenario);
    setSimName("");
    setSimGeneralAdjustment(0);
    setSimRiskMargin(0);
    setSimDialogOpen(true);
  };

  const handleCreateSimulation = async () => {
    if (!simName.trim() || !simBaseScenario) return;
    setSimSaving(true);
    try {
      const newScenario = await createScenario({
        name: simName,
        year: simBaseScenario.year,
        description: "Simulação baseada em " + simBaseScenario.name,
        is_baseline: false,
        base_scenario_id: simBaseScenario.id,
        copy_from_previous: false,
      });
      await updateScenario(newScenario.id!, {
        general_adjustment: simGeneralAdjustment,
        risk_margin: simRiskMargin,
      });
      setSimDialogOpen(false);
      navigate(`/scenarios/${newScenario.id}/edit`);
    } catch (err) {
      alert(`Erro ao criar simulação: ${err}`);
    } finally {
      setSimSaving(false);
    }
  };

  const loadScenarios = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const year = yearFilter ? Number(yearFilter) : undefined;
      const isBaseline =
        typeFilter === "baseline"
          ? true
          : typeFilter === "simulation"
            ? false
            : undefined;
      const data = await listScenarios(year, isBaseline);
      setScenarios(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [yearFilter, typeFilter]);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  const filteredScenarios = scenarios.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  const openCreateDialog = () => {
    setEditingScenario(null);
    setFormName("");
    setFormYear(String(currentYear));
    setFormDescription("");
    setFormIsBaseline(false);
    setFormCopyPrevious(false);
    setDialogOpen(true);
  };

  const openEditDialog = (scenario: BudgetScenario) => {
    setEditingScenario(scenario);
    setFormName(scenario.name);
    setFormYear(String(scenario.year));
    setFormDescription(scenario.description ?? "");
    setFormIsBaseline(scenario.is_baseline);
    setFormCopyPrevious(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingScenario) {
        const request: UpdateScenarioRequest = {
          name: formName,
          year: Number(formYear),
          description: formDescription || null,
          is_baseline: formIsBaseline,
        };
        await updateScenario(editingScenario.id!, request);
      } else {
        const request: CreateScenarioRequest = {
          name: formName,
          year: Number(formYear),
          description: formDescription || null,
          is_baseline: formIsBaseline,
          copy_from_previous: formCopyPrevious,
        };
        await createScenario(request);
      }
      setDialogOpen(false);
      await loadScenarios();
    } catch (err) {
      alert(`Erro: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scenario: BudgetScenario) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o orçamento "${scenario.name}"? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    try {
      await deleteScenario(scenario.id!);
      await loadScenarios();
    } catch (err) {
      alert(`Erro ao excluir: ${err}`);
    }
  };

  const handlePdf = async (scenario: BudgetScenario) => {
    try {
      await generatePdf(scenario.id!);
      alert("PDF gerado com sucesso!");
    } catch (err) {
      alert(`Erro ao gerar PDF: ${err}`);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orçamentos</h1>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Novo Orçamento
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select
          options={[{ value: "", label: "Todos os anos" }, ...yearOptions]}
          value={yearFilter}
          onChange={setYearFilter}
          className="w-44"
        />

        <div className="flex rounded-md border border-gray-300">
          {(
            [
              ["all", "Todos"],
              ["baseline", "Base"],
              ["simulation", "Simulação"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-2 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                typeFilter === key
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar orçamentos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
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
      {loading && (
        <div className="py-12 text-center text-gray-500">Carregando...</div>
      )}

      {/* Empty state */}
      {!loading && filteredScenarios.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16">
          <FileText className="mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-1 text-lg font-medium text-gray-900">
            Nenhum orçamento encontrado
          </h3>
          <p className="mb-4 text-sm text-gray-500">
            Crie um novo orçamento para começar.
          </p>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Novo Orçamento
          </Button>
        </div>
      )}

      {/* Scenarios grid */}
      {!loading && filteredScenarios.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredScenarios.map((scenario) => (
            <Card key={scenario.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{scenario.name}</CardTitle>
                  <div className="flex gap-1">
                    <Badge
                      variant={scenario.is_baseline ? "default" : "secondary"}
                    >
                      {scenario.is_baseline ? "Base" : "Simulação"}
                    </Badge>
                    {scenario.is_approved && (
                      <Badge variant="success">Aprovado</Badge>
                    )}
                    {scenario.is_closed && (
                      <Badge variant="warning">Fechado</Badge>
                    )}
                  </div>
                </div>
                {scenario.description && (
                  <CardDescription>{scenario.description}</CardDescription>
                )}
              </CardHeader>

              <CardContent className="flex-1">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Ano:</span>
                    <span className="font-medium text-gray-900">
                      {scenario.year}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ajuste Geral:</span>
                    <span className="font-medium text-gray-900">
                      {formatPercent(scenario.general_adjustment)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Margem de Risco:</span>
                    <span className="font-medium text-gray-900">
                      {formatPercent(scenario.risk_margin)}
                    </span>
                  </div>
                  {scenario.created_at && (
                    <div className="flex justify-between">
                      <span>Criado em:</span>
                      <span className="text-xs text-gray-500">
                        {formatDate(scenario.created_at)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex-wrap gap-2 border-t border-gray-100 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`/scenarios/${scenario.id}/details`)
                  }
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver Detalhes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`/scenarios/${scenario.id}/summary`)
                  }
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Resumo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`/scenarios/${scenario.id}/analysis`)
                  }
                >
                  <LineChart className="h-3.5 w-3.5" />
                  Análise
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePdf(scenario)}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openSimDialog(scenario)}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Simular
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditDialog(scenario)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleDelete(scenario)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setDialogOpen(false)}>
            <DialogTitle>
              {editingScenario ? "Editar Orçamento" : "Novo Orçamento"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nome *
              </label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Orçamento 2026"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Ano *
              </label>
              <Select
                options={yearOptions}
                value={formYear}
                onChange={setFormYear}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Descrição
              </label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descrição opcional..."
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isBaseline"
                checked={formIsBaseline}
                onChange={(e) => setFormIsBaseline(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isBaseline" className="text-sm text-gray-700">
                Cenário base (referência)
              </label>
            </div>

            {!editingScenario && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="copyPrevious"
                  checked={formCopyPrevious}
                  onChange={(e) => setFormCopyPrevious(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="copyPrevious"
                  className="text-sm text-gray-700"
                >
                  Copiar estrutura do ano anterior
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? "Salvando..." : editingScenario ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Simulation Dialog */}
      <Dialog open={simDialogOpen} onClose={() => setSimDialogOpen(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setSimDialogOpen(false)}>
            <DialogTitle>Nova Simulação</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nome da simulação *
              </label>
              <Input
                value={simName}
                onChange={(e) => setSimName(e.target.value)}
                placeholder="Ex: Simulação otimista 2026"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Cenário base
              </label>
              <Input
                value={simBaseScenario?.name ?? ""}
                readOnly
                disabled
                className="bg-gray-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Ajuste geral (%)
              </label>
              <Input
                type="number"
                value={simGeneralAdjustment}
                onChange={(e) =>
                  setSimGeneralAdjustment(Number(e.target.value))
                }
                step="0.01"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Margem de risco (%)
              </label>
              <Input
                type="number"
                value={simRiskMargin}
                onChange={(e) => setSimRiskMargin(Number(e.target.value))}
                step="0.01"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSimDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSimulation}
              disabled={simSaving || !simName.trim()}
            >
              {simSaving ? "Criando..." : "Criar Simulação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
