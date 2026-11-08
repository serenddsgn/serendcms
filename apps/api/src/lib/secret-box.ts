import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Verschlüsselt kleine Geheimnisse (API-Keys) für die Datenbank: AES-256-GCM, Schlüssel per HKDF aus
 * SECRETS_ENCRYPTION_KEY. Der Name des Eintrags ist zusätzlich authentifizierte Eingabe (AAD), ein Chiffrat
 * lässt sich also nicht unter einem anderen Namen einspielen. Format: `v1.<iv>.<tag>.<chiffrat>` (base64url).
 */
export function createSecretBox(secretsKey: string) {
  const key = Buffer.from(
    hkdfSync('sha256', secretsKey, 'serend-secret-box', 'integration-secrets-v1', 32),
  );
  return {
    seal(name: string, plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(name));
      const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return ['v1', iv, cipher.getAuthTag(), ct]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
        .join('.');
    },
    /** Wirft bei falschem Schlüssel, falschem Namen oder verändertem Chiffrat. */
    open(name: string, sealed: string): string {
      const [version, iv, tag, ct] = sealed.split('.');
      if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unbekanntes Chiffratformat');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(name));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ct, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
