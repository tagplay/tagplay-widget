'use strict';

var Tagplay = require('tagplay');
var dataset = require('data-set');
var isDom = require('is-dom');
var postWidget = require('@tagplay/tagplay-standalone-post');
var generateCSS = require('@tagplay/tagplay-widget-styles').generateCSS;

module.exports = Widget;

function Widget(container, config) {
  if (!(this instanceof Widget)) return new Widget(config);
  if (!container || !isDom(container)) return console.error('[tagplay-widget] Missing placeholder div element');
  if (!config) config = extractConfigFromDom(container);
  if (!config) return console.error('[tagplay-widget] Missing configuration');

  this.client = new Tagplay(config);
  this.config = extend(config);
  this.container = container;
  this.name = container.name || config.feed.substring(0, 6);
  addStyles(this);
  fetch(this);
}

function extractConfigFromDom(elem) {
  var ds = dataset(elem);
  // Forcing true into some values since some of the data-set parameters only need to exist in html to be truthfully
  Object.keys(ds).forEach(function(key) {
    if (!ds[key]) ds[key] = true;
    if (key.indexOf('-') !== -1) ds[key.replace(/-/g, '_')] = ds[key];
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

function addStyles(self) {
  // Check if we have at least one element with an ID surrounding the container
  if (!self.container.id) {
    self.container.id = "tagplay-widget-" + this.name;
  }
  var selectorPrefix = "#" + self.container.id + ".tagplay-widget ";

  var curContainer = self.container;
  while (curContainer.parentNode) {
    curContainer = curContainer.parentNode;
    if (curContainer.id) {
      selectorPrefix = "#" + curContainer.id + " " + selectorPrefix;
      break;
    }
  }

  var css = generateCSS(selectorPrefix, self.config, !!self.config.responsive);

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
  config.client = self.client;
  var elem = postWidget(post, config);
  self.container.appendChild(elem);
}
