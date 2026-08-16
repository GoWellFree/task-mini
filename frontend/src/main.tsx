import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./lib/AuthContext";
import { initTelegramApp } from "./lib/telegram";
import { applyTheme, getThemePreference } from "./lib/theme";
import { ToastProvider } from "./components/ui/Toast";
import { QuickAddProvider } from "./lib/QuickAddContext";
import "./index.css";

initTelegramApp();
applyTheme(getThemePreference());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <QuickAddProvider>
            <App />
          </QuickAddProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
