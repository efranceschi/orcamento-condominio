import { useState, useEffect } from "react";
import {
  Download,
  Upload,
  Database,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  FolderTree,
  FileText,
  Hash,
} from "lucide-react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import { exportData, importData, getDbStats } from "../lib/api";
import type { DbStats } from "../types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function BackupPage() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await getDbStats();
      setStats(data);
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const jsonString = await exportData();

      const filePath = await save({
        title: "Exportar Backup",
        defaultPath: `backup_orcamento_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          { name: "JSON", extensions: ["json"] },
        ],
      });

      if (filePath) {
        await writeTextFile(filePath, jsonString);
        setToast({
          type: "success",
          message: `Backup exportado com sucesso para: ${filePath}`,
        });
      }
    } catch (err) {
      setToast({ type: "error", message: `Erro ao exportar: ${err}` });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    const confirmed = window.confirm(
      "ATENÇÃO: A importação substituirá TODOS os dados existentes. Deseja continuar?",
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      const filePath = await open({
        title: "Importar Backup",
        multiple: false,
        filters: [
          { name: "JSON", extensions: ["json"] },
        ],
      });

      if (filePath) {
        const jsonString = await readTextFile(filePath as string);
        const result = await importData(jsonString);
        setToast({ type: "success", message: result });
        await loadStats();
      }
    } catch (err) {
      setToast({ type: "error", message: `Erro ao importar: ${err}` });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Backup e Restauração</h1>
        <p className="mt-1 text-sm text-gray-500">
          Exporte e importe os dados do sistema para manter backups seguros.
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
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Estatísticas do Banco */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Estatísticas do Banco de Dados
        </h2>
        {loading ? (
          <div className="py-4 text-center text-gray-500">Carregando...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-blue-100 p-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.scenario_count}
                  </p>
                  <p className="text-xs text-gray-500">Cenários</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-green-100 p-2">
                  <FolderTree className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.category_count}
                  </p>
                  <p className="text-xs text-gray-500">Categorias</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Hash className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.item_count}
                  </p>
                  <p className="text-xs text-gray-500">Itens</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-orange-100 p-2">
                  <Database className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatBytes(stats.db_size_bytes)}
                  </p>
                  <p className="text-xs text-gray-500">Tamanho do DB</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Exportar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            Exportar Dados
          </CardTitle>
          <CardDescription>
            Exporte todos os dados do sistema em formato JSON. O arquivo gerado pode
            ser usado para restaurar os dados posteriormente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Exportando..." : "Exportar Backup"}
          </Button>
        </CardContent>
      </Card>

      {/* Importar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-orange-600" />
            Importar Dados
          </CardTitle>
          <CardDescription>
            Restaure dados a partir de um arquivo de backup JSON exportado
            anteriormente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600" />
            <div className="text-sm text-orange-800">
              <p className="font-medium">Atenção</p>
              <p>
                A importação irá substituir <strong>todos</strong> os dados
                existentes no sistema. Recomendamos fazer um backup antes de
                prosseguir.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={importing}
          >
            <Upload className="h-4 w-4" />
            {importing ? "Importando..." : "Importar Backup"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
