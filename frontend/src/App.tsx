import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import { api } from "./lib/api";
import { Loading, ErrorMessage } from "./components/Feedback";
import { BottomNav } from "./components/BottomNav";
import { Home } from "./pages/Home";
import { MyTasks } from "./pages/MyTasks";
import { Workspaces } from "./pages/Workspaces";
import { WorkspaceDetail } from "./pages/WorkspaceDetail";
import { CreateTask } from "./pages/CreateTask";
import { TaskDetail } from "./pages/TaskDetail";
import { Profile } from "./pages/Profile";
import type { Workspace } from "./types";

export function App() {
  const { user, loading, error, startParam, retry } = useAuth();

  if (loading) return <Loading label="Авторизация через Telegram..." />;
  if (error || !user) {
    return <ErrorMessage message={error ?? "Не удалось авторизоваться"} onRetry={retry} />;
  }

  return (
    <>
      <StartParamHandler startParam={startParam} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/my-tasks" element={<MyTasks />} />
        <Route path="/workspaces" element={<Workspaces />} />
        <Route path="/workspaces/:id" element={<WorkspaceDetail />} />
        <Route path="/tasks/new" element={<CreateTask />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

// Handles deep links opened via start_param: invite_<code> or task_<id>.
function StartParamHandler({ startParam }: { startParam: string | null }) {
  const navigate = useNavigate();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (!startParam || handled) return;
    setHandled(true);

    if (startParam.startsWith("invite_")) {
      const inviteCode = startParam.replace("invite_", "");
      api
        .post<{ workspace: Workspace }>(`/api/workspaces/join/${inviteCode}`)
        .then((res) => navigate(`/workspaces/${res.workspace.id}`, { replace: true }))
        .catch((err) => {
          // Left silent for the user (they can still open "Группы" and join
          // manually), but logged — this used to fail invisibly, which made
          // a real auth bug here much harder to notice.
          console.error("Failed to auto-join workspace from invite link:", err);
        });
    } else if (startParam.startsWith("task_")) {
      const taskId = startParam.replace("task_", "");
      navigate(`/tasks/${taskId}`, { replace: true });
    }
  }, [startParam, handled, navigate]);

  return null;
}
