import { NavLink } from "react-router-dom";
import { FileText, FolderTree, Settings, Download } from "lucide-react";
import { cn } from "../../lib/utils";

const navItems = [
  { to: "/", icon: FileText, label: "Orçamentos" },
  { to: "/categories", icon: FolderTree, label: "Categorias" },
  { to: "/parameters", icon: Settings, label: "Parâmetros" },
  { to: "/backup", icon: Download, label: "Backup" },
];

export function Sidebar() {
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

      {/* Footer */}
      <div className="border-t border-gray-700 px-5 py-3">
        <span className="text-xs text-gray-500">v1.0.0</span>
      </div>
    </aside>
  );
}
