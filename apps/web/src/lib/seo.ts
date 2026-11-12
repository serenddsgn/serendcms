import type { Locale } from '@serend/schema';
import { homePath, inlineToMarkdown, type Inline } from '@serend/schema';
import { categoryName, setting, type SiteData } from './data';
import type { BuildProject } from '@serend/schema';

export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:4321').replace(/\/$/, '');
export const abs = (path: string) => `${SITE_URL}${path}`;

export const plainText = (runs: Inline | null | undefined): string =>
  (runs ?? []).map((r) => r.text).join('');

export interface Crumb {
  name: string;
  path: string;
}

export function organizationJsonLd(locale: Locale) {
  const identity = setting(locale, 'site.identity');
  const org = setting(locale, 'organization');
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'ProfessionalService'],
    '@id': abs('/#organization'),
    name: org.legalName,
    url: abs(homePath(locale)),
    email: identity.email,
    ...(org.description && { description: org.description }),
    address: { '@type': 'PostalAddress', addressLocality: identity.city.split(',')[0] },
  };
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.path),
    })),
  };
}

/** Die Leistung hinter dem Projekt, damit Suchmaschinen sie dem Studio zuordnen (und nicht dem Kundennamen). */
export function serviceJsonLd(p: BuildProject, url: string) {
  const services = p.revision.categories.map((c) => categoryName(p.locale, c));
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: services.join(', '),
    serviceType: services,
    url: abs(url),
    provider: { '@id': abs('/#organization') },
  };
}

export function creativeWorkJsonLd(
  p: BuildProject,
  url: string,
  imageUrl: string | undefined,
  d: Pick<SiteData, 'mediaById'>,
) {
  void d;
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: p.revision.title,
    headline: p.revision.title,
    ...(p.revision.subtitle && { description: plainText(p.revision.subtitle) }),
    url: abs(url),
    inLanguage: p.locale,
    creator: { '@id': abs('/#organization') },
    keywords: p.revision.categories.map((c) => categoryName(p.locale, c)).join(', '),
    ...(imageUrl && { image: abs(imageUrl) }),
    ...(p.revision.client && {
      sourceOrganization: { '@type': 'Organization', name: p.revision.client },
    }),
  };
}

export { inlineToMarkdown };
