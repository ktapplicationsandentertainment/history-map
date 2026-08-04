const { resolve } = require('path');

module.exports = {
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        map: resolve(__dirname, 'map.html'),
        methodology: resolve(__dirname, 'methodology.html'),
        onThisDay: resolve(__dirname, 'on-this-day.html'),
        lifetime: resolve(__dirname, 'lifetime.html'),
      },
    },
  },
};
