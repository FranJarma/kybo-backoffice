export type InvitationMessage = {
  username: string;
  password: string;
  token: string;
  url: string;
  message: string;
  expiresAt: string;
};
export type InvitationState = {
  status: "pending" | "expired" | "activated";
  expiresAt: string;
  firstLoginAt: string | null;
  verificationConfigured: boolean;
};
export type OnboardingState = {
  needed: boolean;
  enrollmentReady: boolean;
  branchId: string | null;
};
