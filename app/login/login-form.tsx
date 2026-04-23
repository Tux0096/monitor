"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Props = { showGoogle: boolean };

export function LoginForm({ showGoogle }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signIn("password", {
        password,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError("Неверный пароль");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-xl backdrop-blur">
        <h1 className="text-center text-xl font-semibold tracking-tight text-zinc-50">
          Мониторинг отказоустойчивости
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-400">
          Данные Firebase — после входа через Google
        </p>

        {showGoogle ? (
          <>
            <button
              type="button"
              onClick={() => void signIn("google", { callbackUrl })}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-600 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Войти через Google
            </button>
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-900/50 px-2 text-zinc-500">
                  или пароль
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-4 text-center text-xs text-amber-400/90">
            Google OAuth не настроен: задайте GOOGLE_CLIENT_ID и
            GOOGLE_CLIENT_SECRET в .env.local
          </p>
        )}

        <form onSubmit={(e) => void onPasswordSubmit(e)} className="space-y-4">
          <label className="block text-sm text-zinc-300">
            Пароль дашборда
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none ring-emerald-500/40 focus:border-emerald-600 focus:ring-2"
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "Вход…" : "Войти по паролю"}
          </button>
        </form>
      </div>
    </div>
  );
}
