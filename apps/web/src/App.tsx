import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuthStore } from './stores/authStore';
import { LandingPage } from './features/auth/LandingPage';
import { MapPage } from './features/map/MapPage';
import { NavigatePage } from './features/navigate/NavigatePage';
import { ArPage } from './features/ar/ArPage';
import { SafetyPage } from './features/safety/SafetyPage';
import { AdminPage } from './features/admin/AdminPage';
import { MapBuilderPage } from './features/mapBuilder/MapBuilderPage';
import { IndoorMapBuilderPage } from './features/mapBuilder/IndoorMapBuilderPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { TwinPage } from './features/twin/TwinPage';
import { IndoorPage } from './features/indoor/IndoorPage';
import {
  DIGITAL_TWIN_LEGACY_PATH,
  DIGITAL_TWIN_PATH,
} from './features/digitalTwin/types/digitalTwin';

function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/map" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route path="/map" element={<MapPage />} />
        <Route path="/navigate" element={<NavigatePage />} />
        <Route path="/ar" element={<ArPage />} />
        <Route path="/indoor" element={<IndoorPage />} />
        <Route path={DIGITAL_TWIN_PATH} element={<TwinPage />} />
        <Route
          path={DIGITAL_TWIN_LEGACY_PATH}
          element={<Navigate to={DIGITAL_TWIN_PATH} replace />}
        />
        <Route path="/safety" element={<SafetyPage />} />
        <Route
          path="/admin/map-builder/indoor/:buildingId?"
          element={
            <Protected>
              <IndoorMapBuilderPage />
            </Protected>
          }
        />
        <Route
          path="/admin/map-builder"
          element={
            <Protected>
              <MapBuilderPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected admin>
              <AdminPage />
            </Protected>
          }
        />
        <Route
          path="/analytics"
          element={
            <Protected admin>
              <AnalyticsPage />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
