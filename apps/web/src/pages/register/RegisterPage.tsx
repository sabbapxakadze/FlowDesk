import { RegisterForm } from "../../features/register-user";

export function RegisterPage() {
  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Create your account</h1>
      <RegisterForm />
    </main>
  );
}
