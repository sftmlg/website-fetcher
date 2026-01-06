import scrape from 'website-scraper';
import fs from 'fs-extra';
import path from 'path';
import { URL } from 'url';
import type { FetchOptions, PageContent, SiteContent, AssetInfo, FetchResult } from './types.js';
import { extractPageContent, generateLlmsTxt, generateMarkdownReport } from './extractor.js';

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
  const assetsDir = path.join(outputDir, 'assets');
  const contentDir = path.join(outputDir, 'content');

  // Ensure directories exist
  await fs.ensureDir(outputDir);
  await fs.ensureDir(assetsDir);
  await fs.ensureDir(contentDir);

  const errors: string[] = [];
  const pages: PageContent[] = [];
  const assets: AssetInfo[] = [];

  // Build sources config based on options
  const sources: Array<{ selector: string; attr: string }> = [];

  if (includeCss) {
    sources.push({ selector: 'link[rel="stylesheet"]', attr: 'href' });
  }
  if (includeJs) {
    sources.push({ selector: 'script[src]', attr: 'src' });
  }
  if (includeImages) {
    sources.push(
      { selector: 'img', attr: 'src' },
      { selector: 'img', attr: 'srcset' },
      { selector: 'picture source', attr: 'srcset' }
    );
  }
  if (includeAssets) {
    sources.push(
      { selector: 'link[rel="icon"]', attr: 'href' },
      { selector: 'link[rel="apple-touch-icon"]', attr: 'href' },
      { selector: 'video source', attr: 'src' },
      { selector: 'audio source', attr: 'src' }
    );
  }

  // Always include links for recursive crawling
  sources.push({ selector: 'a', attr: 'href' });

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
          const resUrl = new URL(resourceUrl);
          // Only follow links on the same domain
          return resUrl.hostname === baseUrl.hostname;
        } catch {
          return false;
        }
      }
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
  // Handle index.html -> /
  if (relativePath === 'index.html') {
    return base.origin + '/';
  }
  // Remove .html extension for clean URLs
  const cleanPath = relativePath.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return base.origin + '/' + cleanPath;
}

function buildSitemap(pages: PageContent[]): SiteContent['sitemap'] {
  return pages.map(p => ({
    url: p.url,
    title: p.title,
    depth: (p.path.match(/\//g) || []).length
  })).sort((a, b) => a.depth - b.depth);
}
