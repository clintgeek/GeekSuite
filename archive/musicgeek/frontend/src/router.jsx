import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LessonsPage from './pages/LessonsPage';
import LessonDetailPage from './pages/LessonDetailPage';
import ProfilePage from './pages/ProfilePage';
import InstrumentSelectorPage from './pages/InstrumentSelectorPage';
import GuitarTunerPage from './pages/GuitarTunerPage';
import TromboneTunerPage from './pages/TromboneTunerPage';
import MetronomePage from './pages/MetronomePage';
import PracticeSessionPage from './pages/PracticeSessionPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
      {
        path: 'instruments',
        element: (
          <ProtectedRoute>
            <InstrumentSelectorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'instrument/guitar/tuner',
        element: (
          <ProtectedRoute>
            <GuitarTunerPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'instrument/trombone/tuner',
        element: (
          <ProtectedRoute>
            <TromboneTunerPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'metronome',
        element: (
          <ProtectedRoute>
            <MetronomePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'lessons',
        element: (
          <ProtectedRoute>
            <LessonsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'lessons/:id',
        element: (
          <ProtectedRoute>
            <LessonDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'practice/session/:id',
        element: (
          <ProtectedRoute>
            <PracticeSessionPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
