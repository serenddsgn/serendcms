/** Sammelt das Build-Log: Secrets werden geschwärzt, die Größe ist begrenzt (Ende bleibt erhalten). */
export class LogBuffer {
  private text = '';
  constructor(
    private readonly secrets: string[],
    private readonly max = 200_000,
  ) {}

  add(chunk: string): void {
    let c = chunk;
    for (const s of this.secrets) if (s) c = c.split(s).join('[REDACTED]');
    this.text += c;
    if (this.text.length > this.max) this.text = `[… gekürzt …]\n${this.text.slice(-this.max)}`;
  }

  line(s: string): void {
    this.add(`${new Date().toISOString()} ${s}\n`);
  }

  toString(): string {
    return this.text;
  }
}
