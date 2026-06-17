import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen md:grid-cols-[220px_1fr]">
        <aside className="border-b border-zinc-800 bg-zinc-950 p-4 md:border-b-0 md:border-r">
          <div className="text-sm font-medium text-zinc-300">
            Фуджи · мониторинг
          </div>
          <nav className="mt-6 flex gap-2 md:flex-col">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              Аналитика
            </Link>
            <Link
              href="/dashboard/appeals"
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              Обращения
            </Link>
            <Link
              href="/dashboard/couriers"
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              База курьеров
            </Link>
            <Link
              href="/dashboard/points"
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              Точки
            </Link>
          </nav>
          <div className="mt-6 truncate text-xs text-zinc-600">
            {session.user.email ?? session.user.name}
          </div>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
