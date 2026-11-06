import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '../api';
import { useSession } from '../session';
import { Field, Modal, Notice, Pill, errText, fmtDate, useAction } from '../ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function MessagesPage() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ['messages'],
    queryFn: () => api.get<{ messages: any[] }>('/contact-messages'),
  });
  const set = useAction(
    (v: { id: string; status: string }) =>
      api.patch(`/contact-messages/${v.id}`, { status: v.status }),
    [['messages']],
  );
  const del = useAction((id: string) => api.del(`/contact-messages/${id}`), [['messages']]);
  return (
    <>
      <h1>Nachrichten</h1>
      <p className="muted">
        Anfragen über das Kontaktformular. Sie werden nach der konfigurierten Frist automatisch
        gelöscht.
      </p>
      {(q.error || set.error || del.error) && (
        <Notice>{errText(q.error ?? set.error ?? del.error)}</Notice>
      )}
      {q.data?.messages.length === 0 && <p className="muted">Keine Nachrichten.</p>}
      {q.data?.messages.map((m) => (
        <div key={m.id} className="card">
          <div className="row between">
            <div>
              <strong>{m.name}</strong> <a href={`mailto:${m.email}`}>{m.email}</a>{' '}
              <span className="muted small">
                {fmtDate(m.createdAt)} · {m.locale}
              </span>
            </div>
            <div className="row">
              <select
                aria-label="Status"
                value={m.status}
                onChange={(e) => set.mutate({ id: m.id, status: e.target.value })}
              >
                {['new', 'read', 'spam', 'archived'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {user.role === 'admin' && (
                <button
                  className="btn small danger"
                  onClick={() => confirm('Nachricht endgültig löschen?') && del.mutate(m.id)}
                >
                  Löschen
                </button>
              )}
            </div>
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{m.message}</p>
        </div>
      ))}
    </>
  );
}

export function UsersPage() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: any[] }>('/users'),
    enabled: user.role === 'admin',
  });
  const [creating, setCreating] = useState(false);
  const [reset, setReset] = useState<any>(null);
  const keys = [['users']];
  const patch = useAction(
    (v: { id: string; role: string }) => api.patch(`/users/${v.id}`, { role: v.role }),
    keys,
  );
  const toggle = useAction(
    (v: { id: string; disabled: boolean }) =>
      api.post(`/users/${v.id}/${v.disabled ? 'enable' : 'disable'}`),
    keys,
  );
  if (user.role !== 'admin') return <Notice>Nur für Administratoren.</Notice>;
  const err = q.error ?? patch.error ?? toggle.error;
  return (
    <>
      <div className="row between">
        <h1>Benutzer</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          Neuer Benutzer
        </button>
      </div>
      {err && <Notice>{errText(err)}</Notice>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Status</th>
              <th>Letzter Login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data?.users.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    aria-label="Rolle"
                    value={u.role}
                    disabled={u.id === user.id}
                    onChange={(e) => patch.mutate({ id: u.id, role: e.target.value })}
                  >
                    <option>admin</option>
                    <option>editor</option>
                  </select>
                </td>
                <td>{u.disabled ? <Pill value="archived" /> : <Pill value="published" />}</td>
                <td>{fmtDate(u.lastLoginAt)}</td>
                <td className="row">
                  <button className="btn small" onClick={() => setReset(u)}>
                    Passwort
                  </button>
                  {u.id !== user.id && (
                    <button
                      className="btn small"
                      onClick={() => toggle.mutate({ id: u.id, disabled: u.disabled })}
                    >
                      {u.disabled ? 'Aktivieren' : 'Deaktivieren'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <CreateUser onClose={() => setCreating(false)} />}
      {reset && <ResetPassword user={reset} onClose={() => setReset(null)} />}
    </>
  );
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const { register, handleSubmit } = useForm({
    defaultValues: { displayName: '', email: '', role: 'editor', password: '' },
  });
  const create = useAction((v: any) => api.post('/users', v), [['users']], onClose);
  return (
    <Modal title="Neuer Benutzer" onClose={onClose}>
      <form onSubmit={handleSubmit((v) => create.mutate(v))}>
        {create.error && <Notice>{errText(create.error)}</Notice>}
        <Field label="Name">
          <input {...register('displayName', { required: true })} />
        </Field>
        <Field label="E-Mail">
          <input type="email" {...register('email', { required: true })} />
        </Field>
        <Field label="Rolle">
          <select {...register('role')}>
            <option>editor</option>
            <option>admin</option>
          </select>
        </Field>
        <Field label="Passwort (mind. 12 Zeichen)">
          <input
            type="password"
            autoComplete="new-password"
            {...register('password', { required: true, minLength: 12 })}
          />
        </Field>
        <button className="btn primary">Anlegen</button>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: any; onClose: () => void }) {
  const { register, handleSubmit } = useForm({ defaultValues: { newPassword: '' } });
  const reset = useAction((v: any) => api.post(`/users/${user.id}/reset-password`, v), [], onClose);
  return (
    <Modal title={`Passwort für ${user.displayName}`} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => reset.mutate(v))}>
        {reset.error && <Notice>{errText(reset.error)}</Notice>}
        <p className="muted small">Alle Sitzungen dieses Benutzers enden.</p>
        <Field label="Neues Passwort (mind. 12 Zeichen)">
          <input
            type="password"
            autoComplete="new-password"
            {...register('newPassword', { required: true, minLength: 12 })}
          />
        </Field>
        <button className="btn primary">Setzen</button>
      </form>
    </Modal>
  );
}
