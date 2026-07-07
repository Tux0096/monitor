import { auth } from "@/auth";
import { DashboardMobileShell } from "@/components/dashboard-mobile-shell";
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
    <DashboardMobileShell userEmail={session.user.email ?? session.user.name}>
      {children}
    </DashboardMobileShell>
  );
}
