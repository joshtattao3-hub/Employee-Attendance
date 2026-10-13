import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { ToastProvider } from "./context/ToastProvider";
import { DataProvider } from "./context/DataProvider";
import { AuthProvider } from "./context/authProvider";
import ErrorBoundary from "./components/ErrorBoundary";

createRoot(document.getElementById("root")).render(
  <StrictMode>
   <ErrorBoundary>
    <ToastProvider>
      <DataProvider>
        <AuthProvider>
        <App />
        </AuthProvider>
      </DataProvider>
    </ToastProvider>
   </ErrorBoundary>  
  </StrictMode>
);