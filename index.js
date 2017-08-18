'use strict';

var Tagplay = require('tagplay');
var dataset = require('data-set');
var isDom = require('is-dom');
var lightbox = require('tagplay-lightbox');
var postWidget = require('tagplay-standalone-post');
var generateCSS = require('@tagplay/tagplay-widget-styles').generateCSS;

module.exports = Widget;

if (typeof window !== 'undefined' && window.tagplayWidgetQueue) {
  window.tagplayWidgetQueue.forEach(function (widgetElement) {
    Widget(widgetElement);
  });
  window.tagplayWidgetQueue = null;
}

function Widget (container, config, posts) {
  if (!(this instanceof Widget)) return new Widget(container, config, posts);
  if (!container || !isDom(container)) return console.error('[tagplay-widget] Missing placeholder div element');
  if (!config) config = extractConfigFromDom(container);
  if (!config) return console.error('[tagplay-widget] Missing configuration');

  this.client = new Tagplay(config);
  this.config = extend(config);
  this.container = container;
  this.name = container.getAttribute('name') || config.feed.substring(0, 6);

  this.posts = [];

  this.hasOpenLightbox = false;

  if (!this.container.id) {
    this.container.id = 'tagplay-widget-' + this.name;
  }

  addStyles(this);

  if (posts) {
    loadPosts(this, posts);
  } else {
    fetch(this);
  }

  var self = this;

  window.addEventListener('popstate', function (event) {
    if (event.state && event.state.tagplayLightbox && event.state.tagplayLightbox.id === self.container.id) {
      openLightbox(self, event.state.tagplayLightbox.post, event.state.tagplayLightbox.mediaIndex, true);
    } else if ((!event.state || !event.state.tagplayLightbox) && self.hasOpenLightbox) {
      closeLightbox(self, true);
    }
  });
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
  var styleId = 'tagplay-widget-style-' + self.name;

  var existingStyle = document.getElementById(styleId);
  if (existingStyle) {
    head.removeChild(existingStyle);
  }

  var style = document.createElement('style');

  style.id = styleId;
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

    if (body && body.data) loadPosts(self, body.data);
  });
}

function copyObject (obj) {
  var newObj = {};
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}

function loadPosts (self, posts) {
  posts.forEach(each);

  if (window.history.state && window.history.state.tagplayLightbox && window.history.state.tagplayLightbox.id === self.container.id) {
    openLightbox(self, window.history.state.tagplayLightbox.post, window.history.state.tagplayLightbox.mediaIndex, true);
  }

  function each (post) {
    if (self.config.flatten_posts && (post.videos.length > 0 || post.images.length > 0)) {
      var posts = [];
      post.videos.forEach(function (video, i) {
        posts.push(flattenPost([], [video], '-video-' + i));
      });
      post.images.forEach(function (image, i) {
        posts.push(flattenPost([image], [], '-image-' + i));
      });
      posts.sort(function (a, b) {
        return a.order - b.order;
      })
      posts.forEach(addPost);
    } else {
      addPost(post);
    }

    function flattenPost (images, videos, idSuffix) {
      var flattenedPost = copyObject(post);
      flattenedPost.images = images;
      flattenedPost.videos = videos;
      flattenedPost.id += idSuffix;
      return flattenedPost;
    }

    function addPost (post) {
      if (self.posts.length < self.config.num_media) {
        self.posts.push(post);
        show(self, post);
      }
    }
  }
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
      openLightbox(self, post, 0);
    };
  }
  var elem = postWidget(post, config, onclick);
  var parent = getPostParent(self);
  parent.appendChild(elem);
}

function onLightboxClose (self) {
  self.hasOpenLightbox = false;
  if (window.history.pushState) window.history.pushState({}, '');
}

function openLightbox (self, post, mediaIndex, fromHistory) {
  if (!fromHistory && window.history.pushState) {
    var state = { tagplayLightbox: { id: self.container.id, post: post, mediaIndex: mediaIndex } };
    if (self.hasOpenLightbox) {
      window.history.replaceState(state, '');
    } else {
      window.history.pushState(state, '');
    }
  }
  lightbox.open(
    postWidget(post, lightboxConfig(self.config), null, mediaIndex),
    getCanNavigateFunc(self, post, mediaIndex),
    getNavigateFunc(self, post, mediaIndex),
    self.container.id + '-lightbox',
    function () {
      onLightboxClose(self);
    }
  );
  self.hasOpenLightbox = true;
}

function closeLightbox (self, fromHistory) {
  console.log('Calling closeLightbox');
  self.hasOpenLightbox = false;
  lightbox.close(function () {
    if (!fromHistory) onLightboxClose(self);
  });
}

function getPostMedia (post, opt) {
  if (opt.no_images) {
    return post.videos;
  } else {
    return post.videos.concat(post.images);
  }
}

function isPostEmpty (post, opt) {
  return !post.text && !(post.image && !opt.no_images) && !(post.video && !opt.no_videos) && !(post.linked_metadata && opt.include_linked_metadata);
}

function getCanNavigateFunc (self, post, mediaIndex) {
  return function (dir) {
    return !!getNavigatedPost(self, post, dir, mediaIndex);
  };
}

function getNavigateFunc (self, post, mediaIndex) {
  return function (dir) {
    var navigated = getNavigatedPost(self, post, dir, mediaIndex);
    if (navigated) {
      var nextPost = navigated[0];
      var nextMediaIndex = navigated[1];
      openLightbox(self, nextPost, nextMediaIndex);
    } else {
      closeLightbox(self);
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

function getNavigatedPost (self, post, direction, mediaIndex) {
  var nextPost;
  if (mediaIndex !== undefined && post) {
    var nextMediaIndex = mediaIndex + direction;

    if (nextMediaIndex >= 0 && nextMediaIndex < getPostMedia(post, self.config).length) {
      nextPost = post;
    } else {
      var index = findPostIndex(self, post);
      if (index === null) return null;

      if (nextMediaIndex >= 0) {
        nextPost = self.posts[index + 1];
        nextMediaIndex = 0;
      } else {
        nextPost = self.posts[index - 1];
        nextMediaIndex = nextPost && getPostMedia(nextPost, self.config).length - 1;
      }
    }
  } else {
    nextPost = self.posts[index + direction];
    nextMediaIndex = undefined;
  }

  if (!nextPost) return null;

  if (isPostEmpty(nextPost, self.config)) {
    return getNavigatedPost(self, nextPost, direction, nextMediaIndex);
  }

  return [nextPost, nextMediaIndex];
}

function lightboxConfig (config) {
  return getModifiedConfig(config, { inline_video: true, inline_link_embed: true, play_video: true, play_sound: true, full_link_description: true });
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
