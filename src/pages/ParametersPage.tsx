import { useState, useEffect } from "react";
import { Save, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import { getParameters, updateParameters } from "../lib/api";
import type { UpdateParametersRequest } from "../types";

export default function ParametersPage() {
  const [totalSquareMeters, setTotalSquareMeters] = useState<string>("0");
  const [habiteSeDiscount, setHabiteSeDiscount] = useState<string>("0");
  const [lotSimulation1, setLotSimulation1] = useState<string>("0");
  const [lotSimulation2, setLotSimulation2] = useState<string>("0");
  const [lotSimulation3, setLotSimulation3] = useState<string>("0");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    loadParameters();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadParameters = async () => {
    try {
      setLoading(true);
      const params = await getParameters();
      setTotalSquareMeters(String(params.total_square_meters));
      setHabiteSeDiscount(String(params.habite_se_discount));
      setLotSimulation1(String(params.lot_simulation_1));
      setLotSimulation2(String(params.lot_simulation_2));
      setLotSimulation3(String(params.lot_simulation_3));
    } catch (err) {
      setToast({ type: "error", message: `Erro ao carregar parâmetros: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const request: UpdateParametersRequest = {
        total_square_meters: Number(totalSquareMeters) || 0,
        habite_se_discount: Math.max(0, Math.min(100, Number(habiteSeDiscount) || 0)),
        lot_simulation_1: Number(lotSimulation1) || 0,
        lot_simulation_2: Number(lotSimulation2) || 0,
        lot_simulation_3: Number(lotSimulation3) || 0,
      };
      await updateParameters(request);
      setToast({ type: "success", message: "Parâmetros salvos com sucesso!" });
    } catch (err) {
      setToast({ type: "error", message: `Erro ao salvar: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-gray-500">Carregando...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Parâmetros do Sistema</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure os parâmetros globais utilizados nos cálculos orçamentários.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-md p-4 text-sm ${
            toast.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      <div className="space-y-6">
        {/* Metragem */}
        <Card>
          <CardHeader>
            <CardTitle>Metragem do Condomínio</CardTitle>
            <CardDescription>
              Área total do condomínio em metros quadrados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Metragem total (m²)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={totalSquareMeters}
                onChange={(e) => setTotalSquareMeters(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Descontos */}
        <Card>
          <CardHeader>
            <CardTitle>Descontos</CardTitle>
            <CardDescription>
              Percentuais de desconto aplicáveis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Desconto Habite-se (%)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={habiteSeDiscount}
                onChange={(e) => setHabiteSeDiscount(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Valor entre 0 e 100.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Simulações de Lotes */}
        <Card>
          <CardHeader>
            <CardTitle>Simulações de Lotes</CardTitle>
            <CardDescription>
              Valores para simulação de diferentes cenários de lotes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Simulação de Lote 1
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lotSimulation1}
                  onChange={(e) => setLotSimulation1(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Simulação de Lote 2
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lotSimulation2}
                  onChange={(e) => setLotSimulation2(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Simulação de Lote 3
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lotSimulation3}
                  onChange={(e) => setLotSimulation3(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Parâmetros"}
          </Button>
        </div>
      </div>
    </div>
  );
}
