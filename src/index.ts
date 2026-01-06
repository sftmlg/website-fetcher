#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { fetchWebsite } from './crawler.js';
import type { FetchOptions } from './types.js';

const program = new Command();

program
  .name('website-fetcher')
  .description('Recursive website content fetcher for AI/LLM analysis')
  .version('1.0.0');

program
  .command('fetch <url>')
  .description('Fetch entire website content recursively')
  .option('-o, --output <dir>', 'Output directory', './fetched')
  .option('-d, --depth <number>', 'Maximum recursion depth', '10')
  .option('--no-recursive', 'Disable recursive crawling')
  .option('--no-assets', 'Skip downloading assets (CSS, JS, images)')
  .option('--no-css', 'Skip CSS files')
  .option('--no-js', 'Skip JavaScript files')
  .option('--no-images', 'Skip images')
  .option('--no-content', 'Skip content extraction')
  .option('--no-llms', 'Skip llms.txt generation')
  .option('--no-markdown', 'Skip markdown report generation')
  .option('-c, --concurrency <number>', 'Max concurrent requests', '5')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '30000')
  .option('-u, --user-agent <string>', 'Custom user agent')
  .action(async (url: string, opts) => {
    const spinner = ora('Initializing...').start();

    try {
      // Normalize URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      const outputDir = path.resolve(opts.output);

      spinner.text = `Fetching ${url}...`;

      const options: FetchOptions = {
        url,
        outputDir,
        recursive: opts.recursive !== false,
        maxDepth: parseInt(opts.depth),
        includeAssets: opts.assets !== false,
        includeCss: opts.css !== false,
        includeJs: opts.js !== false,
        includeImages: opts.images !== false,
        extractContent: opts.content !== false,
        generateLlmsTxt: opts.llms !== false,
        generateMarkdown: opts.markdown !== false,
        maxConcurrency: parseInt(opts.concurrency),
        timeout: parseInt(opts.timeout),
        userAgent: opts.userAgent
      };

      spinner.stop();
      console.log(chalk.blue('\n=== Website Fetcher ===\n'));
      console.log(`URL: ${chalk.green(url)}`);
      console.log(`Output: ${chalk.green(outputDir)}`);
      console.log(`Recursive: ${options.recursive ? chalk.green('Yes') : chalk.yellow('No')}`);
      console.log(`Max Depth: ${chalk.cyan(options.maxDepth)}`);
      console.log('');

      const result = await fetchWebsite(options);

      console.log('');
      if (result.success) {
        console.log(chalk.green('=== Fetch Complete ==='));
      } else {
        console.log(chalk.yellow('=== Fetch Complete (with errors) ==='));
      }

      console.log(`Pages: ${chalk.cyan(result.siteContent.totalPages)}`);
      console.log(`Assets: ${chalk.cyan(result.siteContent.totalAssets)}`);
      console.log(`Output: ${chalk.blue(result.outputDir)}`);

      console.log('\nGenerated files:');
      console.log(`  - ${chalk.green('site-content.json')} - Structured content data`);
      console.log(`  - ${chalk.green('site-content.md')} - Markdown report`);
      console.log(`  - ${chalk.green('llms-txt-suggestion.txt')} - Suggested llms.txt`);
      console.log(`  - ${chalk.green('assets-index.json')} - Asset catalog`);
      console.log(`  - ${chalk.green('assets/')} - Downloaded files`);
      console.log(`  - ${chalk.green('content/')} - Extracted page content`);

      if (result.errors.length > 0) {
        console.log(chalk.yellow(`\nWarnings (${result.errors.length}):`));
        result.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
        if (result.errors.length > 5) {
          console.log(`  ... and ${result.errors.length - 5} more`);
        }
      }

    } catch (err) {
      spinner.fail('Fetch failed');
      console.error(chalk.red(`Error: ${err}`));
      process.exit(1);
    }
  });

program
  .command('analyze <dir>')
  .description('Analyze previously fetched content')
  .action(async (dir: string) => {
    const contentPath = path.resolve(dir, 'site-content.json');

    if (!await fs.pathExists(contentPath)) {
      console.error(chalk.red(`No site-content.json found in ${dir}`));
      process.exit(1);
    }

    const content = await fs.readJson(contentPath);

    console.log(chalk.blue('\n=== Site Analysis ===\n'));
    console.log(`Base URL: ${chalk.green(content.baseUrl)}`);
    console.log(`Fetched: ${chalk.cyan(content.fetchedAt)}`);
    console.log(`Pages: ${chalk.cyan(content.totalPages)}`);
    console.log(`Assets: ${chalk.cyan(content.totalAssets)}`);

    console.log('\n' + chalk.yellow('Pages:'));
    content.pages.forEach((p: any) => {
      console.log(`  - ${p.title} (${p.path})`);
      console.log(`    Headings: ${p.headings.length}, Paragraphs: ${p.paragraphs.length}, Images: ${p.images.length}`);
    });

    console.log('\n' + chalk.yellow('Asset Breakdown:'));
    const assetTypes = content.assets.reduce((acc: any, a: any) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    Object.entries(assetTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });

    // Check for LLM optimization gaps
    console.log('\n' + chalk.yellow('LLM Optimization Check:'));
    const hasLlmsTxt = content.pages.some((p: any) =>
      p.extractedText?.includes('llms.txt') || false
    );
    const hasStructuredData = content.pages.some((p: any) =>
      p.metadata?.structuredData?.length > 0
    );
    const hasLocalBusiness = content.pages.some((p: any) =>
      JSON.stringify(p.metadata?.structuredData || []).includes('LocalBusiness')
    );

    console.log(`  - Structured Data: ${hasStructuredData ? chalk.green('Yes') : chalk.red('Missing')}`);
    console.log(`  - LocalBusiness Schema: ${hasLocalBusiness ? chalk.green('Yes') : chalk.red('Missing')}`);

    console.log('\n' + chalk.blue('Suggested llms.txt saved to: llms-txt-suggestion.txt'));
  });

program.parse();
