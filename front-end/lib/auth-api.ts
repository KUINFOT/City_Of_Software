export type AppRole = 'vendor' | 'reviewer' | 'admin';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  organization: string;
  phone: string;
  role: AppRole;
  status: 'active' | 'suspended';
};

export type AuthSession = { user: AuthUser; token: string };
export type RegistrationResponse = { nextStep: 'vendor_onboarding' | 'verify_email' };
export type ManagedUser = Omit<AuthUser, 'status'> & { status: 'pending_verification' | 'active' | 'suspended'; emailVerified: boolean; createdAt: string; lastLoginAt: string | null };

type Credentials = { email: string; password: string };
type Registration = Credentials & { name: string; organization: string; phone: string; role: 'vendor' | 'reviewer' };
type PasswordReset = { token: string; password: string };
type MessageResponse = { message?: string; error?: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request(path: string, body: Credentials | Registration): Promise<AuthSession> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { user?: AuthUser; token?: string; error?: string } | null;
  if (!response.ok || !payload?.user || !payload.token) throw new Error(payload?.error ?? 'Unable to reach the sign-in service.');
  return { user: payload.user, token: payload.token };
}

async function requestMessage(path: string, body: Pick<Registration, 'email'> | Registration | PasswordReset): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as MessageResponse | null;
  if (!response.ok) throw new Error(payload?.error ?? 'Unable to reach the sign-in service.');
}

export function login(credentials: Credentials): Promise<AuthSession> {
  return request('/auth/login', credentials);
}

export async function register(input: Registration): Promise<RegistrationResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as (RegistrationResponse & MessageResponse) | null;
  if (!response.ok || !payload?.nextStep) throw new Error(payload?.error ?? 'Unable to create your account.');
  return payload;
}

export function resendVerification(email: string): Promise<void> {
  return requestMessage('/auth/resend-verification', { email });
}

export function requestPasswordReset(email: string): Promise<void> {
  return requestMessage('/auth/forgot-password', { email });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return requestMessage('/auth/reset-password', { token, password });
}

export async function completeVendorOnboarding(registration: Registration, profile: import('./vendor-profile').VendorProfile): Promise<{ email: string }> {
  const response = await fetch(`${apiBaseUrl}/auth/complete-vendor-onboarding`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration, profile }),
  });
  const payload = (await response.json().catch(() => null)) as { email?: string; error?: string } | null;
  if (!response.ok || !payload?.email) throw new Error(payload?.error ?? 'Unable to save the vendor profile.');
  return { email: payload.email };
}

async function adminRequest<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options?.headers },
  });
  const payload = (await response.json().catch(() => null)) as T & { error?: string } | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? 'Unable to reach the account-management service.');
  return payload;
}

export function listManagedUsers(token: string): Promise<{ users: ManagedUser[] }> {
  return adminRequest('/admin/users', token);
}

export function updateManagedUser(token: string, userId: string, changes: Partial<Pick<ManagedUser, 'role' | 'status'>>): Promise<{ user: ManagedUser }> {
  return adminRequest(`/admin/users/${userId}`, token, { method: 'PATCH', body: JSON.stringify(changes) });
}
