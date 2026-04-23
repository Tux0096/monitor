import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const showGoogle = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
          Загрузка…
        </div>
      }
    >
      <LoginForm showGoogle={showGoogle} />
    </Suspense>
  );
}
