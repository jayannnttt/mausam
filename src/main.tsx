import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PreferencesProvider } from "./state/preferencesContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </React.StrictMode>,
);
