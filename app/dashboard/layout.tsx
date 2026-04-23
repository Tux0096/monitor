import { auth } from "@/auth";
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
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-sm font-medium text-zinc-300">
            Фуджи · отказоустойчивость
          </span>
          <span className="max-w-[50%] truncate text-xs text-zinc-500">
            {session.user.email ?? session.user.name}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
