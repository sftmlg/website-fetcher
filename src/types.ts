export interface FetchOptions {
  url: string;
  outputDir: string;
  recursive?: boolean;
  maxDepth?: number;
  includeAssets?: boolean;
  includeCss?: boolean;
  includeJs?: boolean;
  includeImages?: boolean;
  extractContent?: boolean;
  generateLlmsTxt?: boolean;
  generateMarkdown?: boolean;
  maxConcurrency?: number;
  timeout?: number;
  userAgent?: string;
}

export interface PageContent {
  url: string;
  path: string;
  title: string;
  description?: string;
  headings: Heading[];
  paragraphs: string[];
  lists: ListItem[];
  links: LinkInfo[];
  images: ImageInfo[];
  metadata: PageMetadata;
  rawHtml?: string;
  extractedText: string;
}

export interface Heading {
  level: number;
  text: string;
}

export interface ListItem {
  type: 'ul' | 'ol';
  items: string[];
}

export interface LinkInfo {
  href: string;
  text: string;
  isExternal: boolean;
}

export interface ImageInfo {
  src: string;
  alt: string;
  localPath?: string;
}

export interface PageMetadata {
  charset?: string;
  viewport?: string;
  robots?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  structuredData?: object[];
}

export interface SiteContent {
  baseUrl: string;
  fetchedAt: string;
  totalPages: number;
  totalAssets: number;
  pages: PageContent[];
  assets: AssetInfo[];
  sitemap: SitemapEntry[];
  suggestedLlmsTxt: string;
}

export interface AssetInfo {
  url: string;
  localPath: string;
  type: 'css' | 'js' | 'image' | 'font' | 'other';
  size?: number;
}

export interface SitemapEntry {
  url: string;
  title: string;
  depth: number;
  children?: SitemapEntry[];
}

export interface FetchResult {
  success: boolean;
  siteContent: SiteContent;
  outputDir: string;
  errors: string[];
}
