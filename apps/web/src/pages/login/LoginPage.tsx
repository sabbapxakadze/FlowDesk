import { LoginForm } from "../../features/login-user";

export function LoginPage() {
  return (
    <main className="p-8">
      <h1 className="mb-4 font-display text-3xl font-normal">Log in</h1>
      <LoginForm />
    </main>
  );
}
