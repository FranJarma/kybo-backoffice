export type PasswordPolicyState = {
  ready: boolean;
  required: boolean;
  firstLoginAt: string | null;
  expiresAt: string | null;
  blocked: boolean;
};
