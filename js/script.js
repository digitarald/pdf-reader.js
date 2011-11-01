/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// 'use strict';

var PR = {};

// Poor man's modernizr for CSS3
var css3Support = (function() {
	var style = document.documentElement.style;
	
	// weird edge cases lead this this
	// (incoherent prefixes + could not detect transitionend for FF)
	
	if ('transform' in style) return {
		transformStyle: 'transform',
		transitionStyle: 'transition',
		transitionEndEvent: 'transitionend',
	};
	if ('MozTransform' in style) return {
		transformStyle: 'MozTransform',
		transitionStyle: 'MozTransition',
		transitionEndEvent: 'transitionend',
	};
	if ('webkitTransform' in style) return {
		transformStyle: 'webkitTransform',
		transitionStyle: 'webkitTransition',
		transitionEndEvent: 'webkitTransitionEnd',
	};
	return {};
	
})(); // end css3Support

// Touch events
var touchSupport = (function() {
	if (Browser.Features.iOSTouch) return {
		touchy: true,
		start: 'touchstart',
		move: 'touchstart',
		end: 'touchstart',
	}; else return {
		touchy: false,
		start: 'mousedown',
		move: 'mousemove',
		end: 'mouseup',
	};
})(); // end touchSupport

/**
 * PR.Container
 */
PR.Container = new Class({

	initialize: function(fileURL) {
		this.element = document.id('main');

		this.fileURL = fileURL;

		this.pages = {};

		this.pageLayout = 0;
		this.running = 0;
		this.pageNum = 1;
		// 1 is cover, 2 is actual index
		this.pageStart = 2;
		this.scale = 1;
		
		this.ready = false;

		window.addEvent('keydown', this.onKey.bind(this));
		window.addEvent('resize', this.onResize.bind(this));
		
		if (touchSupport.touchy) {
			window.addEvent(touchSupport.start, this.onTouchStart.bind(this));
			window.addEvent(touchSupport.move, this.onTouchMove.bind(this));
			window.addEvent(touchSupport.end, this.onTouchEnd.bind(this));
			
			window.addEvent('gesturestart', this.onGestureStart.bind(this));
			window.addEvent('gesturechange', this.onGestureChange.bind(this));
			window.addEvent('gestureend', this.onGestureEnd.bind(this));
			
			window.addEvent('orientationchange', this.onResize.bind(this));
		} else {
			window.addEvent('dblclick', this.onDblClick.bind(this));
		}
		
		this.layout();

		this.loadFromURL();
	},

	// TODO Split loader/progress indicator into extra class (with interface for DB loading)
	loadFromURL: function() {
		
		var xhr = new XMLHttpRequest();
		
		xhr.open('GET', this.fileURL, true);
		xhr.responseType = 'arraybuffer';
		
		var label = new Element('span', {text: 'Loading …'}),
			progress = new Element('progress', {max: 100}),
			status = new Element('label', {'id': 'progress'}).adopt(progress, label).inject(this.element);
			
		if (!('value' in progress)) progress.addClass('progress-spinner');
			
		xhr.onprogress = function(evt) {
      if (evt.lengthComputable) {
      	var percentage = Math.round(evt.loaded / evt.total * 100);
      	label.set('text', percentage + '%');
      	progress.value = percentage;
      }
      
		};
		xhr.onerror = function(evt) {
			status.addClass('error');
			label.set('text', 'Could not open file.');
		};
		xhr.onload = function(evt) {
			progress.value = 100;
			label.set('text', 'Processing …');
			
			var buffer = xhr.mozResponseArrayBuffer || xhr.responseArrayBuffer || new Uint8Array(xhr.response);
			xhr = null;

			this.doc = new PDFJS.PDFDoc(buffer);
			
			status.destroy();
			
			this.setup();
		}.bind(this);

		xhr.send();
	},
	
	setup: function() {
		this.pageCount = this.doc.numPages;
		
		this.pageList = {};
		for (var i = 1; i <= this.pageCount; i++) {
			this.pageList[i] = new PR.Page(i, this);
		}
		
		this.ready = true;
		this.layout();
	},
	
	layout: function() {
		this.width = document.getWidth();
		this.height = document.getHeight();
		
		this.element.setStyles({width: this.width, height: this.height});
		
		if (!this.ready) return;
		
		var previousLayout = this.pageLayout;
		this.pageLayout = (this.width > this.height) ? 2 : 1;
		this.pageNum - (this.pageNum - this.pageStart) % 2;
		
		if (previousLayout != this.pageLayout)
			this.render();
		else
			this.updateRender();
	},

	render: function(direction) {
		if (this.previousContainer) this.previousContainer.destroy();
		this.previousContainer = this.currentContainer;
		
		var container = this.currentContainer = new Element('div', {
			'class': 'page-container animated',
			styles: {
				zIndex: this.pageCount - this.pageNum + 100
			}
		});
		
		for (var i = 0; i < this.pageLayout; i++) {
			var page = this.pageList[this.pageNum + i];
			if (!page) continue; // TODO: add empty page?
			
			page.render();
			page.element.inject(container);
		}
		
		// Figure out animations
		
		// Clean up old elements after animation
		var cleanup = function(previous) {
			if (!previous || !previous.parentNode)
				return;
			
			// Keep page references intact
			previous.getElements('.page').dispose();
			
			this.renderPreemptive(direction);
			
			previous.destroy();
			previous = null;
		}.bind(this, this.previousContainer);
		
		if (direction == -1) {
			container.setStyle(css3Support.transformStyle, 'translate(' + (-this.width) + 'px, 0)');
			container.inject(this.element);
			
			container.offsetWidth; // flush repaint
			container.setStyle(css3Support.transformStyle, 'translate(0px)');
			container.addEventListener(css3Support.transitionEndEvent, cleanup, false);
		} else if (this.previousContainer) {
			container.inject(this.element);
			
			this.previousContainer.addEventListener(css3Support.transitionEndEvent, cleanup, false);
			this.previousContainer.setStyle(css3Support.transformStyle, 'translate(' + -this.width + 'px, 0)');
		} else {
			container.inject(this.element);
		}
		
	},
	
	updateRender: function() {
		for (var i = 0; i < this.pageLayout; i++) {
			var page = this.pageList[this.pageNum + i];
			if (!page) continue; // TODO: add empty page?
			page.render((this.scale == 1) ? 'original' : 'zoom');
		}
	},
	
	renderPreemptive: function(direction) {
		var from = (direction < 0)
			? (this.pageNum - this.pageLayout * 2)
			: (this.pageNum + this.pageLayout);
		var to = (direction > 0)
			? (this.pageNum + this.pageLayout * 2)
			: (this.pageNum - 1);
			
		for (from; from < to; from++) {
			var page = this.pageList[from];
			if (!page) continue;
			
			page.render();
		}
	},
	
	triggerZoom: function(x, y) {
		var zoom = (this.scale == 1);

		if (zoom || (x || y)) {
			this.center = {
				x: x || (this.width / 2),
				y: y || (this.height / 2)
			};
		}
		
		this.pan(zoom ? 2 : 1);
	},
	
	turn: function(to) {
		var num = this.pageNum + this.pageLayout * to;
		if (num < 1 || num >= this.pageCount - this.pageLayout) return this;
		
		this.pageNum = num;
		this.render(to);
	},
	
	pan: function(zoomTo) {
		zoomTo = zoomTo || this.scale;
		
		// correct rendering after zoom
		var endHandler = function(evt) {
			if (!endHandler) return;
			endHandler = null;
			
			this.currentContainer.removeEventListener(css3Support.transitionEndEvent, endHandler, false);
			
			(function() {

				// Lock on target after zooming in
				if (this.scale > 1) {
				
					this.currentContainer.removeClass('animated');
					
					var styles = {
						width: this.width * this.scale,
						height: this.height * this.scale
					};
					var transform = 'translate({x}px, {y}px)'.substitute({
						x: (- this.center.x) * this.scale + this.width / 2,
						y: (- this.center.y) * this.scale + this.height / 2,
					});
					styles[css3Support.transformStyle] = transform;
					this.currentContainer.setStyles(styles);
					
					this.updateRender();
					
					this.currentContainer.offsetLeft; // flush re-flow
					this.currentContainer.addClass('animated');
				} else {
					this.updateRender();
				}
			}).delay(100, this);
			
		}.bind(this);
		
		
		if (zoomTo > 1) { // Start zoom in
			
			if (this.scale == zoomTo) {
				var transform = 'translate({x}px, {y}px)'.substitute({
					x: this.center.x * this.scale,
					y: this.center.y * this.scale
				});
			} else {
				this.scale = zoomTo;
				
				var transform = 'scale({scale}) translate({x}px, {y}px)'.substitute({
					x: this.width / 2 - this.center.x,
					y: this.height / 2 - this.center.y,
					scale: this.scale
				});
			}
			this.currentContainer.setStyle(css3Support.transformStyle, transform);
			
		} else { // Start zoom out
			var previousScale = this.scale;
			this.scale = 1;
			
			this.currentContainer.removeClass('animated');
			
			var transform = 'scale({scale}) translate({x}px, {y}px)'.substitute({
				x: (- this.center.x) + this.width / 2,
				y: (- this.center.y) + this.height / 2,
				scale: previousScale
			});
			this.currentContainer.setStyle(css3Support.transformStyle, transform);
			
			this.currentContainer.setStyles({width: null, height: null});
			
			this.currentContainer.offsetLeft; // flush re-flow
			this.currentContainer.addClass('animated');
			
			this.currentContainer.setStyle(css3Support.transformStyle, 'scale(1) translate(0px, 0px)');
		}
		
		this.currentContainer.addEventListener(css3Support.transitionEndEvent, endHandler, false);
	},

	onKey: function(evt) {
		if (!this.ready) return;
		
		switch (evt.key) {
		case 'left':
			if (this.scale > 1) {
				this.center.x -= this.width / 10;
				this.pan();
			} else {
				this.turn(-1);
			}
			break;
		case 'right':
			if (this.scale > 1) {
				this.center.x += this.width / 10;
				this.pan();
			} else {
				this.turn(1);
			}
			break;
		case 'space':
			this.triggerZoom();
			break;
		case 'up':
			break;
		case 'down':
			break;
		default:
			return;
		}

		evt.preventDefault();
	},

	onResize: function() {
		if (this.layoutTimer) clearTimeout(this.layoutTimer);
		
		this.layoutTimer = (function() {
			this.layout();
		}).delay(200, this);
	},
	
	onDblClick: function(evt) {
		evt.preventDefault();
		
		if (!this.ready) return;
		
		this.triggerZoom(evt.page.x, evt.page.y)
	},
	
	onTouchStart: function(evt) {
		evt.preventDefault();
		
		if (!this.ready) return;
		
    if (evt.targetTouches.length != 1)
  		return false;
  		
  	var previous = this.touchStart;
		var touch = this.touchStart = {
			x: evt.targetTouches[0].clientX,
			y: evt.targetTouches[0].clientY,
			time: Date.now()
		};
		
		if (touch.x > this.width - this.width / 10) {
			this.turn(1);
		} else if (touch.x < this.width / 10) {
			this.turn(-1);
		}
		
		if (previous && touch.time < previous.time + 500) {
			this.triggerZoom(evt.page.x, evt.page.y);
		}
	},
	
	onTouchMove: function(evt) {
		evt.preventDefault();
		
		if (!this.ready) return;
	},
	
	onTouchEnd: function(evt) {
		evt.preventDefault();
		
		if (!this.ready) return;
	},
	
	onGestureStart: function(evt) {
		evt.preventDefault();
		
		if (!this.ready) return;
	},
	
	onGestureChange: function(evt) {
		evt.preventDefault();
		
		if (!this.ready) return;
	},
	
	onGestureEnd: function(evt) {
		evt.preventDefault();
		
		if (!this.ready) return;
	}
	
}); // end PR.Container


/**
 * PR.Page
 */
PR.Page = new Class({
	
	Extends: Events,

	initialize: function(num, container) {
		this.num = num;
		this.container = container;
		
		this.running = [];
		this.canvasList = {};
	},

	setup: function() {
		if (!this.doc) {
			this.doc = this.container.doc.getPage(this.num);
		}

		if (!this.element) {
			this.element = new Element('div', {
				id: 'page-' + this.num,
				'class': 'page'
			});
		}

		return true;
	},
	
	render: function(version, bounds) {
		if (!this.setup())
			return;
			
		// TODO handle .running, by delayed render
		
		var scale = this.container.scale,
			pageLayout = this.container.pageLayout,
			position = (this.num - 1) % pageLayout;
		
		version = version || 'original';
		bounds = bounds || {
			x: this.container.width * scale / pageLayout,
			y: this.container.height * scale
		};

		// Calculate best fit canvas size
		var docSize = {x: this.doc.width, y: this.doc.height},
			sizeRel = {x: docSize.x / bounds.x, y: docSize.y / bounds.y},
			size = (sizeRel.x > sizeRel.y) // select best boundary
				? {x: bounds.x, y: docSize.y / sizeRel.x} // stretch by x
				: {x: docSize.x / sizeRel.y, y: bounds.y}; // stretch by y
		
		if (this.version == version && this.width == size.x && this.height == size.y)
			return;
			
		this.version = version;
		this.width = size.x.floor();
		this.height = size.y.floor();
		
		var current = this.canvasList[this.version];
		if (current && current.width == this.width && current.height == this.height) {
			console.log('PR.Page: SKIPPED render ' + this.num + '-' + version);
			
			this.onRenderComplete();
			return this;
		}
		
		// Clean up old version
		if (current) current = current.destroy();
			
		var canvas = Element('canvas'),
			context = canvas.getContext('2d');
		
		// Prepare canvas 
		canvas.width = this.width;
		canvas.height = this.height;
		
		var percentages = {
			x: (this.width / bounds.x / pageLayout * 100),
			y: (this.height / bounds.y * 100)
		}, styles = {
			width: percentages.x + '%',
			height: percentages.y + '%',
			top: ((100 - percentages.y) / 2) + '%'
		};
		
		if (pageLayout == 1) {
			styles.left = ((100 - percentages.x) / 2) + '%';
		} else {
			styles[(position) ? 'left' : 'right'] = 50 + '%';
		}
		
		this.element.setStyles(styles);
		
		/*
		maxHeight: (this.height / this.container.height * 100).round(3) + '%',
		minWidth: (this.width / this.container.width * 100).round(3) + '%',
		minHeight: (this.height / this.container.height * 100).round(3) + '%'
		 */
		
		/*
		this.element.setStyles({
			width: this.width,
			height: this.height
		});
		*/
		
		this.running.push(this.version);
		this.container.running++;
		
		this.canvasList[this.version] = canvas;
		
		// Render PDF page into canvas context
		this.doc.startRendering(context, this.onRenderComplete.bind(this));
		
		
		return this;
	},
	
	onRenderComplete: function() {
		this.running.erase(this.version);
		
		this.canvasList[this.version].inject(this.element);
		Object.each(this.canvasList, function(canvas, version) {
			if (this.version != version) {
				canvas.dispose();
			}
		}, this);
	}

}); // end PR.Page

new PR.Container('samples/238670-Innovation-Horizon.pdf');
