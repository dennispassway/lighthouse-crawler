const cheerio = require('cheerio');
const chromeLauncher = require('chrome-launcher');
const Crawler = require('simplecrawler');
const fs = require('fs');
const lighthouse = require('lighthouse');
const path = require('path');

const defaultOptions = {
  reportsDirectory: 'reports',
  url: 'https://example.com/',
  // See https://github.com/simplecrawler/simplecrawler#configuration
  crawler: {
    interval: 1000,
    maxConcurrency: 3,
    maxDepth: 2,
    respectRobotsTxt: false,
    parseHTMLComments: false,
    parseScriptTags: false,
  },
  // See https://github.com/GoogleChrome/lighthouse/blob/HEAD/docs/configuration.md and https://github.com/GoogleChrome/lighthouse#cli-options
  lighthouse: {
    flags: {
      output: 'html',
    },
    config: {
      extends: 'lighthouse:default',
    },
  },
};

module.exports = async function crawlLighthouse(passedOptions = {}) {
  const crawlerOptions = { ...defaultOptions.crawler, ...passedOptions.crawler };
  const lighthouseOptions = {
    flags: { ...defaultOptions.lighthouse.flags, ...(passedOptions.lighthouse || {}).flags },
    config: { ...defaultOptions.lighthouse.config, ...(passedOptions.lighthouse || {}).config },
  };
  const options = { ...defaultOptions, ...passedOptions, crawler: crawlerOptions, lighthouse: lighthouseOptions };

  const reportsDirectory = path.resolve('.', options.reportsDirectory, new Date().toISOString());
  const urls = await crawlUrls(options);

  console.log(`Found ${urls.length} urls to run through lighthouse.`);

  let i = 0;

  while (i < urls.length) {
    console.log(`Running lighthouse for ${urls[i]}`);
    await runLighthouse({ url: urls[i], reportsDirectory, root: options.url, options: options.lighthouse });
    i++;
  }

  console.log('Done creating reports!');
};

async function crawlUrls({ url, crawler: crawlerOptions }) {
  return new Promise((resolve) => {
    const urls = [];
    const crawler = new Crawler(url);

    Object.entries(crawlerOptions).forEach(([key, value]) => {
      crawler[key] = value;
    });

    crawler.discoverResources = (buffer) => {
      const $ = cheerio.load(buffer.toString('utf8'));
      return $('a[href]')
        .map(function () {
          return $(this).attr('href');
        })
        .get();
    };

    crawler.on('fetchcomplete', ({ url }) => {
      urls.push(url);
    });

    crawler.once('complete', () => {
      resolve([...new Set(urls)]);
    });

    crawler.start();
  });
}

async function runLighthouse({ url, reportsDirectory, root, options }) {
  const { filename, directory } = getDirectoryAndFilename({ url, reportsDirectory, root });

  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const runnerResult = await lighthouse(url, { ...options.flags, port: chrome.port }, options.config);

  const filePath = path.resolve(directory, `${filename}.${options.flags.output || 'html'}`);
  const reportHtml = runnerResult.report;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filePath, reportHtml);

  await chrome.kill();
}

function getDirectoryAndFilename({ url, root, reportsDirectory }) {
  const urlWithoutRoot = url.replace(root, '');
  const urlParts = urlWithoutRoot.split('/');
  const directories = urlParts.slice(0, 1);
  const filename = urlParts[urlParts.length - 1];
  const directory = path.resolve(reportsDirectory, ...directories);
  return { directory, filename: filename === '' ? 'index' : filename };
}
