/** App root: routes between onboarding and the personalized dashboard. */

import { usePreferences } from "./state/preferencesContext";
import { Onboarding } from "./components/Onboarding";
import { PersonalizedDashboard } from "./components/PersonalizedDashboard";

export default function App() {
  const { prefs } = usePreferences();
  return prefs.onboarded ? <PersonalizedDashboard /> : <Onboarding />;
}
