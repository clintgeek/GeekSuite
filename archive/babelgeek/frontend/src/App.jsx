import { Navigate, Route, Routes } from "react-router-dom";
import LayoutShell from "./components/LayoutShell";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import LearnPage from "./pages/LearnPage";
import LessonPage from "./pages/LessonPage";
import PracticePage from "./pages/PracticePage";
import ConversationPage from "./pages/ConversationPage";
import VocabularyPage from "./pages/VocabularyPage";
import StatsPage from "./pages/StatsPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

const App = () => (
  <Routes>
    {/* Public routes */}
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />

    {/* Protected routes with layout */}
    <Route
      path="/"
      element={
        <ProtectedRoute>
          <LayoutShell />
        </ProtectedRoute>
      }
    >
      <Route index element={<HomePage />} />
      <Route path="learn" element={<LearnPage />} />
      <Route path="lesson/:lessonId" element={<LessonPage />} />
      <Route path="practice" element={<PracticePage />} />
      <Route path="stats" element={<StatsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>

    {/* Full-screen protected pages without layout shell */}
    <Route
      path="/practice/conversation"
      element={
        <ProtectedRoute>
          <ConversationPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/practice/vocabulary"
      element={
        <ProtectedRoute>
          <VocabularyPage />
        </ProtectedRoute>
      }
    />
  </Routes>
);

export default App;
