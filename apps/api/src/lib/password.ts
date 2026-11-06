import argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Läuft auch für unbekannte Benutzer (Hash-Attrappe), damit die Antwortzeit nicht verrät, ob die E-Mail existiert. */
  verify(hash: string | undefined, password: string): Promise<boolean>;
}

export interface HasherOptions {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export function createPasswordHasher(opts: HasherOptions): PasswordHasher {
  const params = { type: argon2.argon2id, ...opts } as const;
  let dummy: Promise<string> | undefined;
  return {
    hash: (password) => argon2.hash(password, params),
    async verify(hash, password) {
      dummy ??= argon2.hash('dummy-password-for-timing', params);
      const target = hash ?? (await dummy);
      try {
        const ok = await argon2.verify(target, password);
        return hash !== undefined && ok;
      } catch {
        return false;
      }
    },
  };
}
