import { NavLink } from "react-router-dom";
import { BookText, FileText, Home as HomeIcon, Settings, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/api";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "主操作台", icon: HomeIcon },
  { to: "/params", label: "小说参数", icon: Sparkles },
  { to: "/config", label: "模型配置", icon: Settings },
  { to: "/files", label: "文件预览", icon: FileText },
  { to: "/tools", label: "工具箱", icon: Wrench },
];

const Sidebar = () => {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
        <BookText className="h-6 w-6 text-brand-600" />
        <div>
          <div className="text-sm font-semibold text-slate-900">AI Novel</div>
          <div className="text-xs text-slate-500">Web Console</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">
        Phase 1 MVP · v0.1.0
      </div>
    </aside>
  );
};

export default Sidebar;
