# Website Fetcher CLI

Recursive website content fetcher for AI/LLM analysis. Downloads complete websites including HTML, CSS, JavaScript, images, and extracts structured content for AI consumption.

## Quick Start

**Invocation Pattern**: `pnpm start <command> [args]`

### Common Commands
```bash
pnpm start fetch https://example.com                   # Basic fetch
pnpm start fetch https://example.com -o ./output -d 5  # Custom output & depth
pnpm start fetch https://example.com --no-assets       # HTML only
pnpm start analyze ./fetched                           # Analyze fetched content
```

**Need help?** `pnpm start --help`

---

## Keywords

`website`, `scraper`, `crawler`, `fetch-site`, `download-site`

## Features

- **Full Website Download**: HTML, CSS, JS, images, fonts - everything
- **Recursive Crawling**: Follows links to specified depth
- **Content Extraction**: Structured JSON output of all page content
- **LLM Optimization**: Auto-generates suggested llms.txt
- **Markdown Reports**: Human-readable content summaries
- **Asset Cataloging**: Complete index of all downloaded files

## Installation

```bash
cd claude-code-cli-tools/website-fetcher
pnpm install
```

## Usage

### Fetch a Website

```bash
# Basic fetch
pnpm start fetch https://example.com

# With options
pnpm start fetch https://ferra-physio.at -o ./ferra-output -d 5

# Minimal (no assets)
pnpm start fetch https://example.com --no-assets --no-js
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <dir>` | Output directory | `./fetched` |
| `-d, --depth <n>` | Max recursion depth | `10` |
| `--no-recursive` | Disable recursive crawling | - |
| `--no-assets` | Skip all assets | - |
| `--no-css` | Skip CSS files | - |
| `--no-js` | Skip JavaScript | - |
| `--no-images` | Skip images | - |
| `--no-content` | Skip content extraction | - |
| `--no-llms` | Skip llms.txt generation | - |
| `-c, --concurrency <n>` | Max concurrent requests | `5` |
| `-t, --timeout <ms>` | Request timeout | `30000` |

### Analyze Fetched Content

```bash
pnpm start analyze ./fetched
```

## Output Structure

```
./fetched/
├── site-content.json      # Full structured content (for AI)
├── site-content.md        # Markdown report (human readable)
├── llms-txt-suggestion.txt # Suggested llms.txt content
├── assets-index.json      # Catalog of all assets
├── assets/                # Downloaded files
│   ├── index.html
│   ├── css/
│   ├── js/
│   ├── img/
│   └── fonts/
└── content/               # Extracted page content (JSON)
    ├── index.json
    ├── about.json
    └── ...
```

## Output Format

### site-content.json

```json
{
  "baseUrl": "https://example.com",
  "fetchedAt": "2026-01-06T...",
  "totalPages": 15,
  "totalAssets": 42,
  "pages": [
    {
      "url": "https://example.com/",
      "title": "Homepage",
      "headings": [...],
      "paragraphs": [...],
      "images": [...],
      "metadata": {
        "structuredData": [...]
      },
      "extractedText": "..."
    }
  ],
  "assets": [...],
  "suggestedLlmsTxt": "..."
}
```

## Use Cases

1. **LLM Optimization Audit**: Fetch site, analyze gaps, implement improvements
2. **Content Migration**: Extract all content for rebuilding in new framework
3. **SEO Analysis**: Review structured data, meta tags, content structure
4. **Competitor Analysis**: Document competitor site structure and content
5. **Offline Browsing**: Complete local copy of any website

## Dependencies

- `website-scraper` - Recursive website download
- `cheerio` - HTML parsing and content extraction
- `commander` - CLI interface
- `fs-extra` - Enhanced file operations

## Integration with AI Agents

The JSON output is optimized for AI consumption:

```typescript
// In Claude Code or similar
const content = JSON.parse(fs.readFileSync('site-content.json'));

// Access all page content
content.pages.forEach(page => {
  console.log(page.title, page.extractedText);
});

// Check for missing structured data
const missingSchema = content.pages.filter(p =>
  !p.metadata.structuredData?.length
);

// Use suggested llms.txt
console.log(content.suggestedLlmsTxt);
```
