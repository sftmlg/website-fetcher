import * as cheerio from 'cheerio';
import type {
  PageContent,
  Heading,
  ListItem,
  LinkInfo,
  ImageInfo,
  PageMetadata
} from './types.js';

export function extractPageContent(html: string, url: string): PageContent {
  const $ = cheerio.load(html);
  const baseUrl = new URL(url);

  // Extract title
  const title = $('title').text().trim() ||
                $('h1').first().text().trim() ||
                'Untitled';

  // Extract description
  const description = $('meta[name="description"]').attr('content') ||
                      $('meta[property="og:description"]').attr('content') ||
                      undefined;

  // Extract headings
  const headings: Heading[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = parseInt(el.tagName[1]);
    const text = $(el).text().trim();
    if (text) {
      headings.push({ level, text });
    }
  });

  // Extract paragraphs
  const paragraphs: string[] = [];
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 20) {
      paragraphs.push(text);
    }
  });

  // Extract lists
  const lists: ListItem[] = [];
  $('ul, ol').each((_, el) => {
    const type = el.tagName === 'ul' ? 'ul' : 'ol';
    const items: string[] = [];
    $(el).find('> li').each((_, li) => {
      const text = $(li).text().trim();
      if (text) {
        items.push(text);
      }
    });
    if (items.length > 0) {
      lists.push({ type, items });
    }
  });

  // Extract links
  const links: LinkInfo[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      const isExternal = href.startsWith('http') && !href.includes(baseUrl.hostname);
      links.push({ href, text, isExternal });
    }
  });

  // Extract images
  const images: ImageInfo[] = [];
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    const alt = $(el).attr('alt') || '';
    if (src) {
      images.push({ src, alt });
    }
  });

  // Extract metadata
  const metadata: PageMetadata = {
    charset: $('meta[charset]').attr('charset'),
    viewport: $('meta[name="viewport"]').attr('content'),
    robots: $('meta[name="robots"]').attr('content'),
    canonical: $('link[rel="canonical"]').attr('href'),
    ogTitle: $('meta[property="og:title"]').attr('content'),
    ogDescription: $('meta[property="og:description"]').attr('content'),
    ogImage: $('meta[property="og:image"]').attr('content'),
    structuredData: extractStructuredData($)
  };

  // Extract full text content
  const extractedText = extractFullText($);

  return {
    url,
    path: new URL(url).pathname,
    title,
    description,
    headings,
    paragraphs,
    lists,
    links,
    images,
    metadata,
    rawHtml: html,
    extractedText
  };
}

function extractStructuredData($: cheerio.CheerioAPI): object[] {
  const structuredData: object[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      structuredData.push(json);
    } catch {
      // Ignore invalid JSON
    }
  });
  return structuredData;
}

function extractFullText($: cheerio.CheerioAPI): string {
  // Remove script and style elements
  $('script, style, noscript, iframe').remove();

  // Get text from body
  const body = $('body');
  if (!body.length) {
    return '';
  }

  // Extract text with some structure preservation
  const textParts: string[] = [];

  body.find('h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 5) {
      textParts.push(text);
    }
  });

  return textParts.join('\n\n');
}

export function generateLlmsTxt(pages: PageContent[], baseUrl: string): string {
  const domain = new URL(baseUrl).hostname;
  const lines: string[] = [];

  lines.push(`# ${domain}`);
  lines.push('');

  // Find homepage description
  const homepage = pages.find(p => p.path === '/' || p.path === '');
  if (homepage?.description) {
    lines.push(`> ${homepage.description}`);
    lines.push('');
  }

  // List all pages
  lines.push('## Seiten / Pages');
  lines.push('');

  for (const page of pages) {
    lines.push(`- [${page.title}](${page.url})`);
    if (page.description) {
      lines.push(`  ${page.description}`);
    }
  }
  lines.push('');

  // Extract key content from each page
  lines.push('## Inhalt / Content');
  lines.push('');

  for (const page of pages) {
    if (page.headings.length > 0 || page.paragraphs.length > 0) {
      lines.push(`### ${page.title}`);
      lines.push(`URL: ${page.url}`);
      lines.push('');

      // Add main headings
      for (const h of page.headings.filter(h => h.level <= 2)) {
        lines.push(`- ${h.text}`);
      }

      // Add first paragraph as summary
      if (page.paragraphs[0]) {
        lines.push('');
        lines.push(page.paragraphs[0].substring(0, 300) + (page.paragraphs[0].length > 300 ? '...' : ''));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function generateMarkdownReport(pages: PageContent[], baseUrl: string): string {
  const domain = new URL(baseUrl).hostname;
  const lines: string[] = [];

  lines.push(`# Website Content: ${domain}`);
  lines.push('');
  lines.push(`Fetched: ${new Date().toISOString()}`);
  lines.push(`Total Pages: ${pages.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const page of pages) {
    lines.push(`## ${page.title}`);
    lines.push('');
    lines.push(`**URL:** ${page.url}`);
    if (page.description) {
      lines.push(`**Description:** ${page.description}`);
    }
    lines.push('');

    // Headings structure
    if (page.headings.length > 0) {
      lines.push('### Structure');
      for (const h of page.headings) {
        const indent = '  '.repeat(h.level - 1);
        lines.push(`${indent}- ${h.text}`);
      }
      lines.push('');
    }

    // Content
    if (page.paragraphs.length > 0) {
      lines.push('### Content');
      for (const p of page.paragraphs.slice(0, 10)) {
        lines.push(p);
        lines.push('');
      }
    }

    // Images
    if (page.images.length > 0) {
      lines.push('### Images');
      for (const img of page.images) {
        lines.push(`- ${img.alt || 'No alt text'}: ${img.src}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
