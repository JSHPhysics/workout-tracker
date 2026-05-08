import { Navigate, Route, Routes } from 'react-router-dom';
import { ActiveProfileTheme } from './components/ActiveProfileTheme';
import { AppShell } from './components/AppShell';
import { ProfileCreate } from './screens/ProfileCreate';
import { ProfilePicker } from './screens/ProfilePicker';
import { Today } from './screens/Today';
import { History } from './screens/History';
import { Progress } from './screens/Progress';
import { Routines } from './screens/Routines';
import { RoutineDetail } from './screens/RoutineDetail';
import { RoutineEditor } from './screens/RoutineEditor';
import { Session } from './screens/Session';
import { Settings } from './screens/Settings';
import { Timers } from './screens/Timers';

export function App() {
  return (
    <>
      <ActiveProfileTheme />
      <Routes>
        <Route path="/" element={<ProfilePicker />} />
        <Route path="/profiles/new" element={<ProfileCreate />} />
        <Route element={<AppShell />}>
          <Route path="/today" element={<Today />} />
          <Route path="/history" element={<History />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/routines/new" element={<RoutineEditor />} />
          <Route path="/routines/:id" element={<RoutineDetail />} />
          <Route path="/routines/:id/edit" element={<RoutineEditor />} />
          <Route path="/session/:id" element={<Session />} />
          <Route path="/timers" element={<Timers />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
