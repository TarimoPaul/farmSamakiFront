export interface UserSummary {
  id: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: UserSummary;
}

export interface LoginRequest {
  phone?: string;
  email?: string;
  password: string;
}

export type LoginOutcome =
  | { kind: 'success'; user: UserSummary }
  | { kind: 'invalid-credentials' }
  | { kind: 'pending-approval' }
  | { kind: 'account-disabled' }
  | { kind: 'network-error' };

export interface SignupRequest {
  farmName: string;
  farmLocation?: string;
  ownerName: string;
  phone: string;
  email?: string;
  password: string;
}

export interface ForgotPasswordRequest {
  phone: string;
}

export interface ResetPasswordRequest {
  phone: string;
  otp: string;
  newPassword: string;
}
