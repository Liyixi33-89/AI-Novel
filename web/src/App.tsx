import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Characters from "@/pages/Characters";
import Config from "@/pages/Config";
import Files from "@/pages/Files";
import Home from "@/pages/Home";
import Params from "@/pages/Params";
import Settings from "@/pages/Settings";
import Tools from "@/pages/Tools";

const App = () => {
  return (
    <div className="flex h-full w-full flex-col lg:flex-row">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/params" element={<Params />} />
          <Route path="/config" element={<Config />} />
          <Route path="/files" element={<Files />} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
