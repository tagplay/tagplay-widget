'use strict';

var Tagplay = require('tagplay');
var dataset = require('data-set');
var isDom = require('is-dom');
var postWidget = require('@tagplay/tagplay-standalone-post');
var generateCSS = require('tagplay-widget-styles').generateCSS;

module.exports = Widget;

function Widget(container, config) {
  if (!(this instanceof Widget)) return new Widget(config);
  if (!container || !isDom(container)) return console.error('[tagplay-widget] Missing placeholder div element');
  if (!config) config = extractConfigFromDom(container);
  if (!config) return console.error('[tagplay-widget] Missing configuration');

  this.client = new Tagplay(config);
  this.config = extend(config);
  this.container = container;
  this.name = container.name || generateName();
  addStyles(this);
  fetch(this);
}

function extractConfigFromDom(elem) {
  var ds = dataset(elem);
  // Forcing true into some values since some of the data-set parameters only need to exist in html to be truthfully
  Object.keys(ds).forEach(function(key) {
    if (!ds[key]) ds[key] = true;
  });

  if (!Object.keys(ds).length) return null;
  return ds;
}

function extend(config) {
  config.rows = Number(config.rows || 1);
  config.cols = Number(config.cols || 1);
  config.num_media = config.rows * config.cols;
  return config;
}

function generateName() {
  var chars = []
  for (var i = 0; i < 6; i++) {
    chars[i] = 97 + Math.floor(Math.random() * 26);
  }
  return String.fromCharCode.apply(null, chars);
}

function addStyles(self) {
  self.container.className += " tagplay-widget-" + self.name;

  var css = generateCSS(self.name, self.config);

  var head = document.head || document.getElementsByTagName("head")[0];
  var style = document.createElement("style");

  style.type = 'text/css';
  if (style.styleSheet) {
    style.styleSheet.cssText = css;
  }
  else {
    style.appendChild(document.createTextNode(css));
  }

  head.appendChild(style);
}

function fetch(self) {
  var config = self.config;

  self.client.listPost(config.project, config.feed, {limit: config.num_media}, function(error, body) {
    if (error) return console.error('[tagplay-widget] error:', error);
    if (body && body.data) body.data.forEach(each);

    function each(post) {
      show(self, post);
    }
  });
}

function show(self, post) {
  var config = self.config;
  var media_size = 100 / config.cols;
  var elem = postWidget(post, config);
  elem.setAttribute('style', 'width: ' + media_size + '%');
  self.container.appendChild(elem);
}
