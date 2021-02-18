const crawlLighthouse = require('.');

crawlLighthouse({
  reportsDirectory: 'reports',
  url: 'https://eight.nl/',
  crawler: {
    interval: 100,
  },
});
