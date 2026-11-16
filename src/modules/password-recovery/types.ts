export type RecoveryContext = {
  secret: string;
  channel?: "email" | "whatsapp";
};
export type CodeSender = {
  sendCode(message: { recipient: string; code: string }): Promise<void>;
};
