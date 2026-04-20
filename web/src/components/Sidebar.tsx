import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BookText,
  FileText,
  Home as HomeIcon,
  Menu,
  Settings,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/api";
import ThemeToggle from "./ThemeToggle";

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
  { to: "/settings", label: "系统设置", icon: ShieldAlert },
];

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // 路由切换时自动收起移动端菜单
  useEffect(() => {
    const handleResize = (): void => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleClose = (): void => setMobileOpen(false);
  const handleToggle = (): void => setMobileOpen((prev) => !prev);

  return (
    <>
      {/* 移动端顶栏 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <BookText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI Novel</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleToggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
            tabIndex={0}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 移动端遮罩 */}
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={handleClose}
          aria-label="关闭菜单遮罩"
          tabIndex={-1}
        />
      ) : null}

      <aside
        className={cn(
          "z-40 flex h-full w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
          "fixed inset-y-0 left-0 transform transition-transform duration-200 lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookText className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI Novel</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Web Console</div>
            </div>
          </div>
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={handleClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                )
              }
              aria-label={label}
              tabIndex={0}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
          v0.2.0 · Phase 1 完成
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
