'use strict';

var Tagplay = require('tagplay');
var dataset = require('data-set');
var isDom = require('is-dom');
var postWidget = require('@tagplay/tagplay-standalone-post');
var generateCSS = require('@tagplay/tagplay-widget-styles').generateCSS;

module.exports = Widget;

if (window && window.tagplayWidgetQueue) {
  window.tagplayWidgetQueue.forEach(function(widgetElement) {
    var widget = new Widget(widgetElement);
  });
  window.tagplayWidgetQueue = null;
}

function Widget(container, config) {
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
  if (!('hashtags' in config) && 'text' in config) {
    config.hashtags = (config.text === 'stripped' ? 'remove_triggers' : config.text === 'tagless' ? 'remove' : 'show');
  }
  if (!('strip_hash' in config)) {
    config.strip_hash = config.text === 'normalized' || config.text === 'stripped' || config.text === 'tagless';
  }
  return config;
}

function addStyles(self) {
  // Check if we have at least one element with an ID surrounding the container
  if (!self.container.id) {
    self.container.id = "tagplay-widget-" + self.name;
  }

  var selectorPrefix = "#" + self.container.id + ".tagplay-widget, #" + self.container.id + "-lightbox.tagplay-lightbox";

  var curContainer = self.container;
  while (curContainer.parentNode) {
    curContainer = curContainer.parentNode;
    if (curContainer.id) {
      selectorPrefix = "#" + curContainer.id + " " + selectorPrefix;
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

function column() {
  var col = document.createElement('div');
  col.setAttribute('class', "tagplay-waterfall-column");
  return col;
}

function getPostParent(self) {
  if (self.columns) {
    var shortestCol = 0;
    for (var i = 1; i < self.columns.length; i++) {
      if (self.columns[i].offsetHeight < self.columns[shortestCol].offsetHeight) {
        shortestCol = i;
      }
    }
    return self.columns[shortestCol];
  }
  else {
    return self.container;
  }
}

function fetch(self) {
  var config = self.config;

  self.client.listPost(config.project, config.feed, {limit: config.num_media}, function(error, body) {
    if (error) return console.error('[tagplay-widget] error:', error);
    if (body && body.meta) {
      if (body.meta.branded) {
        addBranding(self);
      }
      self.config.trigger_tags = body.meta.trigger_tags;
    }

    if (body && body.data) body.data.forEach(each);

    function each(post) {
      self.posts.push(post);
      show(self, post);
    }
  });
}

function addBranding(self) {
  // var elem = document.createElement('span');
  // elem.setAttribute('class', 'tagplay-branding');
  // self.container.appendChild(elem);
}

function show(self, post) {
  var config = self.config;
  config.client = self.client;
  var onclick = undefined;
  if (config.lightbox) {
    onclick = function() {
      openLightbox(self, post);
    };
  }
  var elem = postWidget(post, config, onclick);
  var parent = getPostParent(self);
  parent.appendChild(elem);
}

function findPostIndex(self, post) {
  for (var i = 0; i < self.posts.length; i++) {
    if (self.posts[i].id === post.id) {
      return i;
    }
  }
  return null;
}

function getNavigatedPost(self, post, direction) {
  var index = findPostIndex(self, post);
  if (index === null) return null;

  return self.posts[index + direction] || null;
}

function navigate(self, post, direction) {
  var post = getNavigatedPost(self, post, direction);
  if (post) {
    openLightbox(self, post);
  }
  else {
    closeLightbox();
  }
}

function arrow(self, post, direction, className) {
  var a = document.createElement('a');
  a.setAttribute('href', '#');
  a.setAttribute('class', className);
  a.onclick = function(e) {
    if (!e) var e = window.event;
    e.cancelBubble = true;
    if (e.stopPropagation) e.stopPropagation();

    navigate(self, post, direction);
    return false;
  };
  return a;
}

function openLightbox(self, post) {
  closeLightbox();

  var backdrop = document.createElement('div');
  backdrop.setAttribute('class', 'tagplay-lightbox-backdrop');
  backdrop.setAttribute('tabindex', 0);
  backdrop.onclick = closeLightbox;
  backdrop.onkeydown = function(e) {
    if (!e) var e = window.event;
    if (e.keyCode === 37) {
      navigate(self, post, -1);
    }
    else if (e.keyCode === 39) {
      navigate(self, post, 1);
    }
  };

  var lightbox = document.createElement('div');
  lightbox.setAttribute('class', 'tagplay-lightbox');
  lightbox.setAttribute('id', self.container.id + '-lightbox');

  document.body.originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  var widget = postWidget(post, self.config);
  widget.onclick = function(e) {
    if (!e) var e = window.event;
    e.cancelBubble = true;
    if (e.stopPropagation) e.stopPropagation();
  };
  lightbox.appendChild(widget);

  if (getNavigatedPost(self, post, -1)) {
    lightbox.appendChild(arrow(self, post, -1, 'tagplay-lightbox-prev'));
  }
  if (getNavigatedPost(self, post, 1)) {
    lightbox.appendChild(arrow(self, post, 1, 'tagplay-lightbox-next'));
  }

  backdrop.appendChild(lightbox);
  document.body.appendChild(backdrop);
  backdrop.focus();
}

function closeLightbox() {
  var existingBackdrop = document.getElementsByClassName('tagplay-lightbox-backdrop');
  if (existingBackdrop.length > 0) {
    for (var i = 0; i < existingBackdrop.length; i++) {
      document.body.removeChild(existingBackdrop[i]);
    }
    document.body.style.overflow = document.body.originalOverflow || 'auto';
  }
}
