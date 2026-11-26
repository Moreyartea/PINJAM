import { RegisterApplicationForm } from "@/features/komting/register-application-form";

export default function RegisterPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center p-4 sm:py-10 bg-[var(--color-bg)]"
    >
      <RegisterApplicationForm />
    </main>
  );
}
