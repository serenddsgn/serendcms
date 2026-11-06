import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { LoginBody } from '@serend/schema';
import type { z } from 'zod';
import { api } from '../api';
import { Field, Notice, errText, useAction } from '../ui';

type Form = z.input<typeof LoginBody>;

export function LoginPage() {
  const qc = useQueryClient();
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(LoginBody) });
  const login = useAction(
    (v: Form) => api.post('/auth/login', v),
    [],
    () => void qc.invalidateQueries({ queryKey: ['me'] }),
  );
  return (
    <div className="center">
      <form className="card" onSubmit={handleSubmit((v) => login.mutate(v))} noValidate>
        <h1>serendCMS</h1>
        <p className="muted">Anmelden</p>
        {login.error && <Notice>{errText(login.error)}</Notice>}
        <Field label="E-Mail" error={formState.errors.email?.message}>
          <input type="email" autoComplete="username" {...register('email')} />
        </Field>
        <Field label="Passwort" error={formState.errors.password?.message}>
          <input type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <button
          className="btn primary"
          type="submit"
          disabled={login.isPending}
          style={{ width: '100%' }}
        >
          Anmelden
        </button>
      </form>
    </div>
  );
}
