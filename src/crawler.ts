import scrape from 'website-scraper';
import fs from 'fs-extra';
import path from 'path';
import { URL } from 'url';
import type { FetchOptions, PageContent, SiteContent, AssetInfo, FetchResult } from './types.js';
import { extractPageContent, generateLlmsTxt, generateMarkdownReport } from './extractor.js';

// Normalize hostname by stripping www. prefix for comparison
function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

export async function fetchWebsite(options: FetchOptions): Promise<FetchResult> {
  const {
    url,
    outputDir,
    recursive = true,
    maxDepth = 10,
    includeAssets = true,
    includeCss = true,
    includeJs = true,
    includeImages = true,
    extractContent = true,
    generateLlmsTxt: genLlms = true,
    generateMarkdown: genMd = true,
    maxConcurrency = 5,
    timeout = 30000
  } = options;

  const baseUrl = new URL(url);
  const normalizedBaseHost = normalizeHostname(baseUrl.hostname);
  const assetsDir = path.join(outputDir, 'assets');
  const contentDir = path.join(outputDir, 'content');

  // Ensure directories exist (but NOT assets - website-scraper creates that)
  await fs.ensureDir(outputDir);
  await fs.ensureDir(contentDir);
  // Remove assets dir if it exists (website-scraper requires fresh directory)
  await fs.remove(assetsDir);

  const errors: string[] = [];
  const pages: PageContent[] = [];
  const assets: AssetInfo[] = [];

  // Build sources config based on options
  // IMPORTANT: Order matters - HTML links first for recursive crawling
  const sources: Array<{ selector: string; attr: string }> = [
    // Links FIRST for recursive HTML crawling
    { selector: 'a[href]', attr: 'href' },
  ];

  if (includeCss) {
    sources.push(
      { selector: 'link[rel="stylesheet"]', attr: 'href' },
      { selector: 'style', attr: 'src' }
    );
  }
  if (includeJs) {
    sources.push({ selector: 'script[src]', attr: 'src' });
  }
  if (includeImages) {
    sources.push(
      { selector: 'img[src]', attr: 'src' },
      { selector: 'img[data-src]', attr: 'data-src' },
      { selector: 'img[srcset]', attr: 'srcset' },
      { selector: 'picture source[srcset]', attr: 'srcset' },
      { selector: 'source[src]', attr: 'src' },
      { selector: '[style*="background"]', attr: 'style' }
    );
  }
  if (includeAssets) {
    sources.push(
      { selector: 'link[rel="icon"]', attr: 'href' },
      { selector: 'link[rel="shortcut icon"]', attr: 'href' },
      { selector: 'link[rel="apple-touch-icon"]', attr: 'href' },
      { selector: 'link[rel="manifest"]', attr: 'href' },
      { selector: 'video source', attr: 'src' },
      { selector: 'video[src]', attr: 'src' },
      { selector: 'audio source', attr: 'src' },
      { selector: 'audio[src]', attr: 'src' },
      { selector: 'object[data]', attr: 'data' },
      { selector: 'embed[src]', attr: 'src' }
    );
  }

  console.log(`Starting fetch of ${url}...`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Recursive: ${recursive}, Max depth: ${maxDepth}`);

  try {
    // Use website-scraper for full download
    const result = await scrape({
      urls: [url],
      directory: assetsDir,
      recursive,
      maxRecursiveDepth: maxDepth,
      sources,
      request: {
        headers: {
          'User-Agent': options.userAgent || 'Mozilla/5.0 (compatible; WebsiteFetcher/1.0; +https://software-moling.com)'
        }
      },
      subdirectories: [
        { directory: 'img', extensions: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico'] },
        { directory: 'css', extensions: ['.css'] },
        { directory: 'js', extensions: ['.js'] },
        { directory: 'fonts', extensions: ['.woff', '.woff2', '.ttf', '.eot', '.otf'] }
      ],
      urlFilter: (resourceUrl: string) => {
        try {
          // Handle relative URLs
          const resUrl = new URL(resourceUrl, url);
          // Only follow links on the same domain (normalize to handle www/non-www)
          const normalizedResHost = normalizeHostname(resUrl.hostname);
          const isSameDomain = normalizedResHost === normalizedBaseHost;
          // Skip anchors, mailto, tel, javascript
          const isValidProtocol = resUrl.protocol === 'http:' || resUrl.protocol === 'https:';
          // Skip admin/wp-admin paths for WordPress sites
          const isNotAdmin = !resUrl.pathname.includes('/wp-admin') && !resUrl.pathname.includes('/wp-login');

          return isSameDomain && isValidProtocol && isNotAdmin;
        } catch {
          // For relative URLs that fail parsing, allow them
          return !resourceUrl.startsWith('mailto:') &&
                 !resourceUrl.startsWith('tel:') &&
                 !resourceUrl.startsWith('javascript:') &&
                 !resourceUrl.startsWith('#');
        }
      },
      // Generate filenames that preserve URL structure
      filenameGenerator: 'bySiteStructure'
    });

    console.log(`Downloaded ${result.length} resources`);

    // Process downloaded HTML files for content extraction
    if (extractContent) {
      console.log('Extracting content from HTML files...');
      const htmlFiles = await findHtmlFiles(assetsDir);

      for (const htmlFile of htmlFiles) {
        try {
          const html = await fs.readFile(htmlFile, 'utf-8');
          const relativePath = path.relative(assetsDir, htmlFile);
          const pageUrl = reconstructUrl(url, relativePath);

          const pageContent = extractPageContent(html, pageUrl);
          pages.push(pageContent);

          // Save extracted content as JSON
          const jsonPath = path.join(contentDir, relativePath.replace('.html', '.json'));
          await fs.ensureDir(path.dirname(jsonPath));
          await fs.writeJson(jsonPath, pageContent, { spaces: 2 });
        } catch (err) {
          errors.push(`Error extracting ${htmlFile}: ${err}`);
        }
      }
    }

    // Catalog all assets
    const allFiles = await findAllFiles(assetsDir);
    for (const file of allFiles) {
      const relativePath = path.relative(assetsDir, file);
      const ext = path.extname(file).toLowerCase();
      const stat = await fs.stat(file);

      let type: AssetInfo['type'] = 'other';
      if (['.css'].includes(ext)) type = 'css';
      else if (['.js'].includes(ext)) type = 'js';
      else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico'].includes(ext)) type = 'image';
      else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) type = 'font';

      assets.push({
        url: reconstructUrl(url, relativePath),
        localPath: relativePath,
        type,
        size: stat.size
      });
    }

  } catch (err) {
    errors.push(`Scraping error: ${err}`);
    console.error('Scraping failed:', err);
  }

  // Build site content object
  const siteContent: SiteContent = {
    baseUrl: url,
    fetchedAt: new Date().toISOString(),
    totalPages: pages.length,
    totalAssets: assets.length,
    pages,
    assets,
    sitemap: buildSitemap(pages),
    suggestedLlmsTxt: genLlms ? generateLlmsTxt(pages, url) : ''
  };

  // Save main output files
  await fs.writeJson(path.join(outputDir, 'site-content.json'), siteContent, { spaces: 2 });

  if (genLlms && siteContent.suggestedLlmsTxt) {
    await fs.writeFile(path.join(outputDir, 'llms-txt-suggestion.txt'), siteContent.suggestedLlmsTxt);
  }

  if (genMd) {
    const markdown = generateMarkdownReport(pages, url);
    await fs.writeFile(path.join(outputDir, 'site-content.md'), markdown);
  }

  // Save asset index
  await fs.writeJson(path.join(outputDir, 'assets-index.json'), assets, { spaces: 2 });

  console.log(`\nFetch complete!`);
  console.log(`- Pages extracted: ${pages.length}`);
  console.log(`- Assets downloaded: ${assets.length}`);
  console.log(`- Errors: ${errors.length}`);

  return {
    success: errors.length === 0,
    siteContent,
    outputDir,
    errors
  };
}

async function findHtmlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...await findHtmlFiles(fullPath));
    } else if (item.name.endsWith('.html') || item.name.endsWith('.htm')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function findAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...await findAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function reconstructUrl(baseUrl: string, relativePath: string): string {
  const base = new URL(baseUrl);

  // bySiteStructure creates folders like: hostname/path/index.html
  // Strip the hostname folder if present
  let pathWithoutHost = relativePath;
  const hostVariants = [
    base.hostname,
    normalizeHostname(base.hostname),
    'www.' + normalizeHostname(base.hostname)
  ];
  for (const host of hostVariants) {
    if (relativePath.startsWith(host + '/')) {
      pathWithoutHost = relativePath.slice(host.length + 1);
      break;
    } else if (relativePath.startsWith(host)) {
      pathWithoutHost = relativePath.slice(host.length);
      break;
    }
  }

  // Handle index.html -> /
  if (pathWithoutHost === 'index.html' || pathWithoutHost === '') {
    return base.origin + '/';
  }
  // Remove .html extension for clean URLs
  const cleanPath = pathWithoutHost.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return base.origin + '/' + cleanPath;
}

function buildSitemap(pages: PageContent[]): SiteContent['sitemap'] {
  return pages.map(p => ({
    url: p.url,
    title: p.title,
    depth: (p.path.match(/\//g) || []).length
  })).sort((a, b) => a.depth - b.depth);
}
