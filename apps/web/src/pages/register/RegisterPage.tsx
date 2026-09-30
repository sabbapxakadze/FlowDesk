import { RegisterForm } from "../../features/register-user";

export function RegisterPage() {
  return (
    <main className="p-8">
      <h1 className="mb-4 font-display text-3xl font-normal">Create your account</h1>
      <RegisterForm />
    </main>
  );
}
