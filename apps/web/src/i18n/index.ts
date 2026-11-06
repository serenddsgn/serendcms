import type { Locale } from '@serend/schema';
import { de } from './de';
import { en } from './en';
import type { UiStrings } from './types';

export const LOCALES: Locale[] = ['de', 'en'];
const dict: Record<Locale, UiStrings> = { de, en };
export const t = (locale: Locale): UiStrings => dict[locale];
export const intlLocale = (locale: Locale): string => (locale === 'de' ? 'de-DE' : 'en-IE');
export type { UiStrings };
