export const userRoles = {
  admin: "Administrador",
  manager: "Encargado",
  staff: "Personal",
} as const;
export type UserRole = keyof typeof userRoles;
export type MembershipInput = { branchId: string; role: "manager" | "staff" };
export type ManagedUser = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: UserRole;
  disabled: boolean;
  catalogManager: boolean;
  memberships: MembershipInput[];
  version: string;
};
export type UsersSnapshot = {
  currentUserId: string;
  rows: ManagedUser[];
  branches: { id: string; name: string }[];
};
