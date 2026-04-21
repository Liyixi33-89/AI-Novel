import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ProjectInfo } from "./api";

/**
 * 项目上下文：全局管理"当前项目"。
 * - 多数页面消费 currentProjectId；独立页面（文件预览、角色库）可自由使用 overrideProjectId
 * - 激活状态改变（activateProject）会同步到后端
 */

type ProjectContextValue = {
  projects: ProjectInfo[];
  currentProjectId: string | null;
  currentProject: ProjectInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setCurrentProjectId: (id: string | null) => void;
  activateProject: (id: string) => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);
const STORAGE_KEY = "ai-novel-current-project";

type Props = { children: React.ReactNode };

export const ProjectProvider = ({ children }: Props) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
      // 如果 currentProjectId 无效（被删除了），回退到 active 项目
      setCurrentProjectIdState((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        const active = list.find((p) => p.is_active);
        return active?.id ?? list[0]?.id ?? null;
      });
    } catch (err) {
      const e = err as { detail?: string };
      setError(e.detail ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 持久化
  useEffect(() => {
    try {
      if (currentProjectId) {
        window.localStorage.setItem(STORAGE_KEY, currentProjectId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [currentProjectId]);

  const setCurrentProjectId = useCallback((id: string | null): void => {
    setCurrentProjectIdState(id);
  }, []);

  const activateProject = useCallback(
    async (id: string): Promise<void> => {
      await api.activateProject(id);
      await refresh();
      setCurrentProjectIdState(id);
    },
    [refresh],
  );

  const currentProject = useMemo<ProjectInfo | null>(() => {
    if (!currentProjectId) return null;
    return projects.find((p) => p.id === currentProjectId) ?? null;
  }, [currentProjectId, projects]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      currentProjectId,
      currentProject,
      loading,
      error,
      refresh,
      setCurrentProjectId,
      activateProject,
    }),
    [projects, currentProjectId, currentProject, loading, error, refresh, setCurrentProjectId, activateProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProjects = (): ProjectContextValue => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
};

/**
 * 独立使用（如文件预览、角色库）：允许组件内维护自己的 projectId，
 * 不影响全局 currentProjectId。
 */
export const useLocalProject = (): {
  localProjectId: string | null;
  setLocalProjectId: (id: string | null) => void;
  projects: ProjectInfo[];
} => {
  const { projects, currentProjectId } = useProjects();
  const [localProjectId, setLocalProjectId] = useState<string | null>(currentProjectId);

  // 当全局切换或首次拿到项目列表时，同步一次
  useEffect(() => {
    setLocalProjectId((prev) => {
      if (prev && projects.some((p) => p.id === prev)) return prev;
      return currentProjectId;
    });
  }, [currentProjectId, projects]);

  return { localProjectId, setLocalProjectId, projects };
};
