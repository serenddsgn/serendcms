import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { Shell } from './Shell';
import { LoginPage } from './pages/LoginPage';
import { BuildsPage } from './pages/BuildsPage';
import { ProjectsPage, ProjectEditPage } from './pages/ProjectsPage';
import { PagesPage, PageEditPage } from './pages/PagesPage';
import { LayoutPage } from './pages/LayoutPage';
import { MediaPage } from './pages/MediaPage';
import { ImportPage } from './pages/ImportPage';
import { ServicesPage, NavigationPage, TeamPage } from './pages/SitePages';
import { SettingsPage } from './pages/SettingsPage';
import { MessagesPage, UsersPage } from './pages/AdminPages';
import { MaintenancePage } from './pages/MaintenancePage';
import { SessionGate } from './session';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: (
      <SessionGate fallback={<LoginPage />}>
        <Shell />
      </SessionGate>
    ),
    children: [
      { index: true, element: <BuildsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectEditPage /> },
      { path: 'layout', element: <LayoutPage /> },
      { path: 'pages', element: <PagesPage /> },
      { path: 'pages/:id', element: <PageEditPage /> },
      { path: 'media', element: <MediaPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'navigation', element: <NavigationPage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'maintenance', element: <MaintenancePage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'users', element: <UsersPage /> },
    ],
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
