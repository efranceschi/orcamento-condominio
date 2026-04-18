import { NavLink } from "react-router-dom";
import { FileText, FolderTree, Settings, Download, ArrowLeftRight, Wifi, WifiOff, Copy } from "lucide-react";
import { cn } from "../../lib/utils";
import { useState, useEffect, useCallback } from "react";
import {
  startNetworkServer,
  stopNetworkServer,
  getNetworkStatus,
  type NetworkInfo,
} from "../../lib/api";

const navItems = [
  { to: "/", icon: FileText, label: "Orçamentos" },
  { to: "/categories", icon: FolderTree, label: "Categorias" },
  { to: "/parameters", icon: Settings, label: "Parâmetros" },
  { to: "/backup", icon: Download, label: "Backup" },
  { to: "/comparison", icon: ArrowLeftRight, label: "Comparação" },
];

/** Detecta se estamos dentro do Tauri WebView */
function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function Sidebar() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const showNetworkControls = isTauri();

  const refreshNetworkStatus = useCallback(async () => {
    if (!showNetworkControls) return;
    try {
      const info = await getNetworkStatus();
      setNetworkInfo(info);
    } catch {
      // Ignora se não está no Tauri
    }
  }, [showNetworkControls]);

  useEffect(() => {
    refreshNetworkStatus();
  }, [refreshNetworkStatus]);

  const toggleNetwork = async () => {
    setNetworkLoading(true);
    try {
      if (networkInfo?.running) {
        const info = await stopNetworkServer();
        setNetworkInfo(info);
      } else {
        const info = await startNetworkServer(3000);
        setNetworkInfo(info);
      }
    } catch (err) {
      console.error("Erro ao alterar servidor de rede:", err);
    } finally {
      setNetworkLoading(false);
    }
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside className="flex h-screen w-60 flex-shrink-0 flex-col bg-gray-900 text-white">
      {/* Logo / Title */}
      <div className="border-b border-gray-700 px-5 py-5">
        <h1 className="text-lg font-bold leading-tight tracking-tight">
          Calculadora
          <br />
          Orçamentária
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-700 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white",
              )
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Network Server Controls — only in Tauri */}
      {showNetworkControls && (
        <div className="border-t border-gray-700 px-4 py-3">
          <button
            onClick={toggleNetwork}
            disabled={networkLoading}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
              networkInfo?.running
                ? "bg-green-900/50 text-green-400 hover:bg-green-900/70"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300",
              networkLoading && "opacity-50 cursor-wait",
            )}
          >
            {networkInfo?.running ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            {networkLoading
              ? "Aguarde..."
              : networkInfo?.running
                ? "Rede ativa"
                : "Ativar rede"}
          </button>

          {networkInfo?.running && networkInfo.addresses.length > 0 && (
            <div className="mt-2 space-y-1">
              {networkInfo.addresses.map((addr) => (
                <button
                  key={addr}
                  onClick={() => copyAddress(addr)}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-green-400 hover:bg-gray-800"
                  title="Clique para copiar"
                >
                  <Copy className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{addr}</span>
                </button>
              ))}
              {copied && (
                <p className="px-2 text-xs text-green-300">Copiado!</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-700 px-5 py-3">
        <span className="text-xs text-gray-500">v1.0.0</span>
      </div>
    </aside>
  );
}
