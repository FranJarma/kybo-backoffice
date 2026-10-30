export type BranchSummary = {
  id: string;
  name: string;
  code: string;
  timeZone: string;
  revision: number;
};

export type BranchLocation = {
  id: string;
  name: string;
  code: string;
  revision: number;
};

export function resolveBranchSelection(
  rows: { id: string }[],
  selected: string,
  preferred: string,
) {
  return (
    [selected, preferred, rows[0]?.id].find((id) =>
      rows.some((row) => row.id === id),
    ) ?? ""
  );
}

export function memberAccess(member: {
  accountRole?: string;
  role: "manager" | "staff" | null;
  revokedAt: string | null;
}) {
  const global = member.accountRole === "admin";
  const enabled = global || (!!member.role && !member.revokedAt);
  return {
    enabled,
    global,
    label: global
      ? "Administrador"
      : !enabled
        ? "Sin acceso"
        : member.role === "manager"
          ? "Encargado"
          : "Personal",
  };
}
