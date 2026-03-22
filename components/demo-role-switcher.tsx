"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface DemoAccount {
  role: "super_admin" | "org_admin" | "operator" | "approver";
  label: string;
  email: string;
}

export function DemoRoleSwitcher({
  accounts
}: {
  accounts: DemoAccount[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchRole(role: DemoAccount["role"]) {
    startTransition(async () => {
      await fetch("/api/session/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role })
      });

      router.push(role === "super_admin" ? "/admin" : "/select-workspace");
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {accounts.map((account) => (
        <button className="buttonLike subtleButton" disabled={isPending} key={account.role} onClick={() => switchRole(account.role)} type="button">
          {account.label} · {account.email}
        </button>
      ))}
    </div>
  );
}
