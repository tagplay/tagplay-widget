'use strict';

var fs = require('fs');
var globalWrap = require('global-wrap');

globalWrap({
  main: 'index.js',
  global: 'TagplayWidget',
  browserifyOptions: { detectGlobals: false }
}, function (err, output) {
  if (err) throw err;

  fs.writeFile('tagplay-widget.js', output, function (err) {
    if (err) throw err;
    console.log('Written tagplay-widget.js');
  });
});
