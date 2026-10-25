import AuthLayout from "../components/AuthLayout";
import LoginPage from "./LoginPage";

function AuthPage() {
  return (
    <AuthLayout>
      <LoginPage />
    </AuthLayout>
  );
}

export default AuthPage;