'use strict';

var Tagplay = require('tagplay');
var dataset = require('data-set');
var isDom = require('is-dom');
var lightbox = require('tagplay-lightbox');
var postWidget = require('tagplay-standalone-post');
var generateCSS = require('@tagplay/tagplay-widget-styles').generateCSS;

module.exports = Widget;

if (window && window.tagplayWidgetQueue) {
  window.tagplayWidgetQueue.forEach(function (widgetElement) {
    Widget(widgetElement);
  });
  window.tagplayWidgetQueue = null;
}

function Widget (container, config) {
  if (!(this instanceof Widget)) return new Widget(container, config);
  if (!container || !isDom(container)) return console.error('[tagplay-widget] Missing placeholder div element');
  if (!config) config = extractConfigFromDom(container);
  if (!config) return console.error('[tagplay-widget] Missing configuration');

  this.client = new Tagplay(config);
  this.config = extend(config);
  this.container = container;
  this.name = container.name || config.feed.substring(0, 6);

  this.posts = [];

  addStyles(this);
  fetch(this);
}

function extractConfigFromDom (elem) {
  var ds = dataset(elem);
  // Forcing true into some values since some of the data-set parameters only need to exist in html to be truthfully
  Object.keys(ds).forEach(function (key) {
    if (!ds[key]) ds[key] = true;
    if (key.indexOf('-') !== -1) ds[key.replace(/-/g, '_')] = ds[key];
  });

  if (!Object.keys(ds).length) return null;
  return ds;
}

function extend (config) {
  config.rows = Number(config.rows || 1);
  config.cols = Number(config.cols || 1);
  config.num_media = config.rows * config.cols;
  if (!('hashtags' in config) && 'text' in config) {
    config.hashtags = (config.text === 'stripped' ? 'remove_triggers' : config.text === 'tagless' ? 'remove' : 'show');
  }
  if (!('strip_hash' in config)) {
    config.strip_hash = config.text === 'normalized' || config.text === 'stripped' || config.text === 'tagless';
  }
  if (!('inline_video' in config)) {
    // By default, don't show video if we have the lightbox on - we can view it in the lightbox
    config.inline_video = !config.lightbox;
  }
  if (!('inline_link_embed' in config)) {
    // By default, don't embed linked metadata inline if we have the lightbox on, as above
    config.inline_link_embed = !config.lightbox;
  }
  return config;
}

function addStyles (self) {
  // Check if we have at least one element with an ID surrounding the container
  if (!self.container.id) {
    self.container.id = 'tagplay-widget-' + self.name;
  }

  var selectorPrefix = '#' + self.container.id + '.tagplay-widget, #' + self.container.id + '-lightbox.tagplay-lightbox';

  var curContainer = self.container;
  while (curContainer.parentNode) {
    curContainer = curContainer.parentNode;
    if (curContainer.id) {
      selectorPrefix = '#' + curContainer.id + ' ' + selectorPrefix;
      break;
    }
  }

  if (self.config.type === 'waterfall') {
    self.columns = [];
    for (var i = 0; i < self.config.cols; i++) {
      var col = column();
      self.columns.push(col);
      self.container.appendChild(col);
    }
  }

  var css = generateCSS(selectorPrefix, self.config, !!self.config.responsive);

  var head = document.head || document.getElementsByTagName('head')[0];
  var style = document.createElement('style');

  style.type = 'text/css';
  if (style.styleSheet) {
    style.styleSheet.cssText = css;
  } else {
    style.appendChild(document.createTextNode(css));
  }

  head.appendChild(style);
}

function column () {
  var col = document.createElement('div');
  col.setAttribute('class', 'tagplay-waterfall-column');
  return col;
}

function getPostParent (self) {
  if (self.columns) {
    var shortestCol = 0;
    for (var i = 1; i < self.columns.length; i++) {
      if (self.columns[i].offsetHeight < self.columns[shortestCol].offsetHeight) {
        shortestCol = i;
      }
    }
    return self.columns[shortestCol];
  } else {
    return self.container;
  }
}

function fetch (self) {
  var config = self.config;

  self.client.listPost(config.project, config.feed, {limit: config.num_media}, function (error, body) {
    if (error) return console.error('[tagplay-widget] error:', error);
    if (body && body.meta) {
      if (body.meta.branded) {
        addBranding(self);
      }
      self.config.trigger_tags = body.meta.trigger_tags;
    }

    if (body && body.data) body.data.forEach(each);

    function each (post) {
      self.posts.push(post);
      show(self, post);
    }
  });
}

function addBranding (self) {
  // var elem = document.createElement('span');
  // elem.setAttribute('class', 'tagplay-branding');
  // self.container.appendChild(elem);
}

function show (self, post) {
  var config = self.config;
  config.client = self.client;
  var onclick;
  if (config.lightbox) {
    onclick = function () {
      lightbox.open(postWidget(post, lightboxConfig(config)), getCanNavigateFunc(self, post), getNavigateFunc(self, post), self.container.id + '-lightbox');
    };
  }
  var elem = postWidget(post, config, onclick);
  var parent = getPostParent(self);
  parent.appendChild(elem);
}

function getCanNavigateFunc (self, post) {
  return function (dir) {
    return getNavigatedPost(self, post, dir);
  };
}

function getNavigateFunc (self, post) {
  return function (dir) {
    var nextPost = getNavigatedPost(self, post, dir);
    if (nextPost) {
      lightbox.open(postWidget(nextPost, lightboxConfig(self.config)), getCanNavigateFunc(self, nextPost), getNavigateFunc(self, nextPost), self.container.id + '-lightbox');
    } else {
      lightbox.close();
    }
  };
}

function findPostIndex (self, post) {
  for (var i = 0; i < self.posts.length; i++) {
    if (self.posts[i].id === post.id) {
      return i;
    }
  }
  return null;
}

function getNavigatedPost (self, post, direction) {
  var index = findPostIndex(self, post);
  if (index === null) return null;

  return self.posts[index + direction] || null;
}

function lightboxConfig (config) {
  return getModifiedConfig(config, { inline_video: true, inline_link_embed: true, play_video: true, play_sound: true });
}

function getModifiedConfig (config, edits) {
  var newConfig = {};
  var property;
  for (property in config) {
    if (config.hasOwnProperty(property)) {
      newConfig[property] = config[property];
    }
  }
  for (property in edits) {
    if (edits.hasOwnProperty(property)) {
      newConfig[property] = edits[property];
    }
  }
  return newConfig;
}
