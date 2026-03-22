import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

export function InviteCodeList({
  codes
}: {
  codes: Array<{
    id: string;
    code: string;
    role: WorkspaceRole;
    status: string;
    maxUses: number;
    usedCount: number;
  }>;
}) {
  return (
    <div className="stack">
      {codes.map((code) => (
        <article className="panel teamMemberCard" key={code.id}>
          <div className="teamMemberHeader">
            <div>
              <strong>{code.code}</strong>
              <p className="muted">{roleLabels[code.role]}</p>
            </div>
            <span className="pill">{code.status}</span>
          </div>
          <p className="muted">
            已使用 {code.usedCount} / {code.maxUses}
          </p>
        </article>
      ))}
    </div>
  );
}

