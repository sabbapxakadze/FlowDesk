import { LoginForm } from "../../features/login-user";

export function LoginPage() {
  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Log in</h1>
      <LoginForm />
    </main>
  );
}
