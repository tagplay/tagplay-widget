'use strict';

var fs = require('fs');
var globalWrap = require('global-wrap');
var UglifyJS = require('uglify-js');

globalWrap({
  main: 'index.js',
  global: 'TagplayWidget',
  browserifyOptions: { detectGlobals: false }
}, function (err, output) {
  if (err) throw err;

  var result = UglifyJS.minify(output, { fromString: true });
  fs.writeFile('tagplay-widget.min.js', result.code, function (err) {
    if (err) throw err;
    console.log('Written tagplay-widget.min.js');
  });
});
