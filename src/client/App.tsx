import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import HealthCheck from "./pages/HealthCheck";
import Settings from "./pages/Settings";
import Calendar from "./pages/Calendar";
import Upload from "./pages/Upload";
import Approval from "./pages/Approval";
import QuickPost from "./pages/QuickPost";
import KnowledgeBase from "./pages/KnowledgeBase";
import Archive from "./pages/Archive";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/approval" element={<Approval />} />
          <Route path="/quick-post" element={<QuickPost />} />
          <Route path="/knowledge-base" element={<KnowledgeBase />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/health" element={<HealthCheck />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
