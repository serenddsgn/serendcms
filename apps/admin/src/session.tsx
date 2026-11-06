import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { MeResponse } from '@serend/schema';
import { ApiError, api, setCsrf } from './api';

interface Session {
  user: MeResponse['user'];
  logout: () => Promise<void>;
}
const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession außerhalb von SessionGate');
  return s;
};

/** Zeigt `fallback` (Login), solange keine gültige Session besteht. */
export function SessionGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const r = await api.get<MeResponse>('/auth/me');
      setCsrf(r.csrfToken);
      return r;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (me.isPending) return <div className="center muted">Lädt …</div>;
  if (me.error instanceof ApiError && me.error.status === 401) return <>{fallback}</>;
  if (me.error || !me.data)
    return <div className="center notice error">Verbindung zur API fehlgeschlagen.</div>;
  return (
    <Ctx.Provider
      value={{
        user: me.data.user,
        logout: async () => {
          await api.post('/auth/logout');
          setCsrf('');
          // harter Neustart: räumt jeden Zustand der Sitzung weg (Cache, Formulare, Tokens)
          window.location.assign('/');
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
