import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getCurrentViewer } from "@/lib/auth/session";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = await getCurrentViewer();

  if (!canAccessAdmin(viewer)) {
    redirect("/");
  }

  return children;
}
