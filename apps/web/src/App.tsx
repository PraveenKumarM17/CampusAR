import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuthStore } from './stores/authStore';
import { LandingPage } from './features/auth/LandingPage';
import { MapPage } from './features/map/MapPage';
import { NavigatePage } from './features/navigate/NavigatePage';
import { ArPage } from './features/ar/ArPage';
import { SafetyPage } from './features/safety/SafetyPage';
import { TwinPage } from './features/twin/TwinPage';
import { IndoorPage } from './features/indoor/IndoorPage';
import {
  DIGITAL_TWIN_LEGACY_PATH,
  DIGITAL_TWIN_PATH,
} from './features/digitalTwin/types/digitalTwin';

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/" replace />;
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
