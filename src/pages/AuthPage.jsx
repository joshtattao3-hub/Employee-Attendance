import { useState } from "react";
import AuthLayout from "../components/AuthLayout";
import LoginPage from "./LoginPage";
import SignupPage from "./SignupPage";

function AuthPage() {
  const [mode, setMode] = useState("login");

  return (
    <AuthLayout>
      {mode === "login" ? (
        <LoginPage onSwitch={() => setMode("signup")} />
      ) : (
        <SignupPage onSwitch={() => setMode("login")} />
      )}
    </AuthLayout>
  );
}

export default AuthPage;