import { readFileSync } from 'node:fs';
import { HtmlValidate, type ConfigData } from 'html-validate/node';
import { htmlFiles, urlOf } from './files.js';

export interface HtmlIssue {
  page: string;
  line: number;
  rule: string;
  message: string;
}
export interface HtmlCheckResult {
  pages: number;
  errors: HtmlIssue[];
}

/**
 * Strukturelle Gültigkeit (Elemente, Attribute, Verschachtelung, IDs). Stilfragen sind bewusst aus:
 * die Seiten setzen Inline-Styles für Prototyp-Werte und Animations-Verzögerungen.
 */
export const HTML_VALIDATE_CONFIG: ConfigData = {
  extends: ['html-validate:recommended'],
  rules: {
    'no-inline-style': 'off',
    'no-trailing-whitespace': 'off',
    'prefer-native-element': 'off',
    'void-style': 'off',
    'attr-quotes': 'off',
    'attribute-boolean-style': 'off',
    'attribute-empty-style': 'off',
    'no-implicit-close': 'off',
    'doctype-style': 'off',
    'long-title': 'off',
    'wcag/h30': 'off',
    'wcag/h32': 'off',
    'wcag/h63': 'off',
    'wcag/h71': 'off',
    'element-permitted-content': 'error',
    'valid-id': ['error', { relaxed: true }],
  },
};

export async function checkHtml(
  dir: string,
  config: ConfigData = HTML_VALIDATE_CONFIG,
): Promise<HtmlCheckResult> {
  const validator = new HtmlValidate(config);
  const files = htmlFiles(dir);
  const errors: HtmlIssue[] = [];
  for (const file of files) {
    // Astro setzt vor jedem Island ein <style> in den Body; das ist Framework-Ausgabe und gültig genug.
    const source = readFileSync(file, 'utf8').replace(
      /<style>astro-island,astro-slot,astro-static-slot\{display:contents\}<\/style>/g,
      '',
    );
    const report = await validator.validateString(source, file);
    for (const r of report.results) {
      for (const m of r.messages) {
        if (m.severity < 2) continue;
        errors.push({
          page: urlOf(dir, file),
          line: m.line,
          rule: m.ruleId ?? 'parse',
          message: m.message,
        });
      }
    }
  }
  return { pages: files.length, errors };
}
