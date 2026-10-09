// Access/refresh tokens persisted in localStorage, with change notifications for React.
const STORAGE_KEY = "logistic.auth";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

const read = (): Tokens | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
};

let current = read();

const emit = () => listeners.forEach((listener) => listener());

export const tokenStore = {
  get: () => current,
  hasTokens: () => current !== null,
  set(tokens: Tokens) {
    current = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    emit();
  },
  clear() {
    current = null;
    localStorage.removeItem(STORAGE_KEY);
    emit();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
