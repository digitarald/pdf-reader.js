/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// 'use strict';

var PR = {};

Uint8Array.prototype.toUnicode = function() {
	console.time('Uint8Array.toUnicode');
	var i = this.length, buffer = new Array(i);
	while (i--) buffer[i] = String.fromCharCode(this[i]);
	return buffer.join('');
	console.timeEnd('Uint8Array.toUnicode');
};

String.prototype.toUint8Array = function() {
	console.time('String.toUint8Array');
	var i = this.length, buffer = new Uint8Array(i);
	while (i--) buffer[i] = this.charCodeAt(i);
	console.timeEnd('String.toUint8Array');
	return buffer;
};


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

	initialize: function() {
		this.element = document.id('main').setStyle('display', '');
		
		this.dashboard = document.id('dashboard');
		this.progress = document.id('progress').setStyle('display', 'none');

		this.pages = {};
		this.pageLayout = 0;
		this.pageOrientation = 0;
		this.pageWidth = this.pageHeight = 1;

		this.running = 0;
		this.pageNum = 1;
		// 1 is cover, 2 is actual index
		this.pageStart = 2;
		this.scale = 1;
		
		
		this.isReady = false;
		this.interactive = false;
		
		PDFJS.workerSrc = location.pathname + 'js/vendor/pdf-js/src/worker_loader.js';

		window.addEvent('keydown', this.onKey.bind(this));
		window.addEvent('resize', this.onResize.bind(this));
		
		// window.addEvent('swipe', function(evt) {
			// this.touchLast = null;
			// this.turn((evt.direction == 'left') ? 1 : -1);
		// }.bind(this));
		
		window.addEvent(touchSupport.start, this.onTouchStart.bind(this));
		window.addEvent(touchSupport.move, this.onTouchMove.bind(this));
		window.addEvent(touchSupport.end, this.onTouchEnd.bind(this));
		
		if (touchSupport.touchy) {

			window.addEvent('pinch', function(evt) {
				this.touchLast = null;
				this.pan((evt.pinch == 'in') ? 2 : 1);
			}.bind(this));
			
			// Prevent gestures
			window.addEvent('gesturestart', this.onGestureStart.bind(this));
			window.addEvent('gesturechange', this.onGestureChange.bind(this));
			window.addEvent('gestureend', this.onGestureEnd.bind(this));
			
			// Mimic to touchend 
			window.addEvent('touchcancel', this.onTouchEnd.bind(this));
			
			window.addEvent('orientationchange', this.onResize.bind(this));
		} else {
			window.addEvent('dblclick', this.onDblClick.bind(this));
			window.addEvent('mousewheel', this.onScroll.bind(this));
		}
		
		this.dashboard.addEvent('click:relay(a)', function(evt) {
			evt.preventDefault();
			
			var href = evt.target.href;
			
			if (!href) return;
			
			this.dashboard.setStyle('display', 'none');
			
			this.fileURL = href;
			this.load();
		}.bind(this));
		
		this.layout();
		
		this.reset();
		
		// this.store = new StickyStore({
			// name: 'files',
			// ready: this.ready.bind(this),
			// size: 200
		// });
	},
	
	reset: function() {
		this.fileURL = null;
		
		if (this.previousContainer) this.previousContainer.destroy();
		if (this.currentContainer) this.currentContainer.destroy();
		
		this.previousContainer = this.currentContainer = null;
		
		if (this.doc) this.doc.destroy();
		this.pageList = this.doc = null;
		
		this.interactive = this.isReady = false;
		
		this.pageNum = 1;
		
		this.dashboard.setStyle('display', '');
	},
	
	// ready: function() {
		// this.store.get(this.fileURL, function(buffer) {
			// if (buffer) {
				// this.doc = new PDFJS.PDFDoc(buffer.toUint8Array());
				// this.setup();
			// } else {
				// this.load();
			// }
		// }.bind(this));
	// },

	// TODO Split loader/progress indicator into extra class (with interface for DB loading)
	load: function() {
		
		var xhr = new XMLHttpRequest();
		
		xhr.open('GET', this.fileURL, true);
		xhr.responseType = 'arraybuffer';
		
		var status = document.id('progress').setStyle('display', ''),
			label = status.getElement('span'),
			progress = status.getElement('progress');
			
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
			
			// this.store.set(this.fileURL, buffer.toUnicode());
			
			console.time('new PDFJS.PDFDoc');
			this.doc = new PDFJS.PDFDoc(buffer);
			console.timeEnd('new PDFJS.PDFDoc');
			
			status.setStyle('display', 'none');
			
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
		
		var page = this.pageList[this.pageNum];
		page.setup();
		this.pageWidth = page.doc.width;
		this.pageHeight = page.doc.height;
		
		this.isReady = true;
		this.layout();
	},
	
	layout: function() {
		this.width = document.getWidth();
		this.height = document.getHeight();
		
		this.element.setStyles({width: this.width, height: this.height});
		
		if (!this.isReady) return;
		
		var previousLayout = this.pageLayout, previousOrientation = this.pageOrientation;
		
		this.pageOrientation = this.pageWidth > this.pageHeight;
		
		// TODO Fix for small sizes that should already switch 
		this.pageLayout = (!this.pageOrientation && this.pageHeight / this.height > this.pageWidth * 2 / this.width) ? 2 : 1;
		
		// TODO Fix for single-page layout
		this.pageNum = 1 + (this.pageNum - this.pageStart) % this.pageLayout;
		
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
		
		console.log(this.currentContainer);
		
		for (var i = 0; i < this.pageLayout; i++) {
			var page = this.pageList[this.pageNum + i];
			if (!page) continue; // TODO: add empty page?
			
			page.render();
			
			page.element.inject(container);
		}
		
		// Figure out animations
		
		// Clean up old elements after animation
		var cleanup = function(previous) {
			this.interactive = true;
			
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
			this.interactive = true;
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

		if (zoom) {
			this.center = {
				x: x || (this.width / 2),
				y: y || (this.height / 2)
			};
		}
		
		this.pan(zoom ? 2 : 1);
	},
	
	turn: function(to) {
		var now = Date.now();
		if (this.turnTimeout && now < this.turnTimeout) return;
		this.turnTimeout = now + 200;
		
		var num = this.pageNum + this.pageLayout * to;
		
		if (num < this.pageLayout - this.pageStart || num > this.pageCount - this.pageLayout + this.pageStart) return this;
		
		this.pageNum = num;
		this.render(to);
	},
	
	pan: function(zoomTo) {
		zoomTo = zoomTo || this.scale;
		
		// TODO: Fit page in-between margin by adjusting center to scale and page dimensions
		
		// correct rendering after zoom
		var cleanup = function(evt) {
			if (!cleanup) return;
			cleanup = null;
			
			this.currentContainer.removeEventListener(css3Support.transitionEndEvent, cleanup, false);
			
			(function() {
				
				this.interactive = true;

				// Lock on target after zooming in
				if (this.scale > 1) {
				
					if (evt) this.currentContainer.removeClass('animated');
					
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
					
					if (evt) this.currentContainer.addClass('animated');
				} else {
					this.updateRender();
				}
			}).delay(100, this);
			
		}.bind(this);
		
		if (zoomTo == this.scale) {
			cleanup();
			return;
		}
		
		this.interactive = false;
		
		if (zoomTo > 1) { // Start zoom in
			
			if (this.scale == zoomTo) {
				var transform = 'translate({x}px, {y}px)'.substitute({
					x: this.center.x * this.scale,
					y: this.center.y * this.scale
				});
				cleanup = null; // simple animation
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
		
		if (cleanup) this.currentContainer.addEventListener(css3Support.transitionEndEvent, cleanup, false);
	},

	onKey: function(evt) {
		if (!this.interactive) return;
		
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
		case 'up':
			if (this.scale > 1) {
				this.center.y -= this.height / 10;
				this.pan();
			} else {
				this.turn(-1);
			}
			break;
		case 'down':
			if (this.scale > 1) {
				this.center.y += this.height / 10;
				this.pan();
			} else {
				this.turn(1);
			}
			break;
		case 'space':
			this.triggerZoom();
			break;
		case 'esc':
			if (this.fileURL) this.reset();
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
		
		if (!this.interactive) return;
		
		this.triggerZoom(evt.page.x, evt.page.y);
	},
	
	onScroll: function(evt) {
		evt.preventDefault();
		
		if (!this.interactive || Math.abs(evt.wheel) < 0.3) return;
		
		if (this.scale > 1) {
			// TODO Allow zoom in wheel when scale works fine
			if (evt.wheel < 0) this.pan(1);
		} else {
			this.turn((evt.wheel < 0) ? 1 : -1);
		}
		
	},
	
	onTouchStart: function(evt) {
		evt.preventDefault();
		
		if (!this.interactive) return;
		
    if (evt.targetTouches && evt.targetTouches.length != 1)
  		return false;
  		
  	var coords = (evt.targetTouches) ? evt.targetTouches[0] : evt;
  	
  	var previous = this.touchLast,
	  	touch = this.touchStart = this.touchLast = {
				x: coords.pageX || coords.page.x,
				y: coords.pageY || coords.page.y,
				time: Date.now()
			};
			
		if (touch.x > this.width - this.width / 10) {
			this.touchLast = null;
			this.turn(1);
		} else if (touch.x < this.width / 10) {
			this.touchLast = null;
			this.turn(-1);
		}
		
		if (previous && touch.time < previous.time + 500) {
			this.triggerZoom(evt.page.x, evt.page.y);
		}
	},
	
	onTouchMove: function(evt) {
		evt.preventDefault();
		
		if (!this.interactive || !this.touchStart) return;
		
		var current = (evt.targetTouches) ? evt.targetTouches[0] : evt,
			distance = {
				x: this.touchStart.x - (current.pageX || current.page.x),
				y: this.touchStart.y - (current.pageY || current.page.y)
			};
			
		if (distance.x.abs() < 5 && distance.y.abs() < 5) return;
		
		if (this.scale <= 1) return;
		
		if (!this.dragDistance) {
			this.currentContainer.removeClass('animated');
		}
		this.dragDistance = distance;
		
		this.currentContainer.setStyle(css3Support.transformStyle, 'translate({x}px, {y}px)'.substitute({
			x: (-this.center.x) - distance.x,
			y: (-this.center.y) - distance.y
		}));
	},
	
	onTouchEnd: function(evt) {
		evt.preventDefault();
		
		this.touchStart = null;
		
		if (this.dragDistance) {
			this.currentContainer.addClass('animated');
			this.center = {
				x: this.center.x + this.dragDistance.x,
				y: this.center.y + this.dragDistance.y
			};
			
			this.dragDistance = null;
		}
		
	},
	
	onGestureStart: function(evt) {
		evt.preventDefault();
		
		if (!this.interactive) return;
	},
	
	onGestureChange: function(evt) {
		evt.preventDefault();
		
		if (!this.interactive) return;
	},
	
	onGestureEnd: function(evt) {
		evt.preventDefault();
		
		if (!this.interactive) return;
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
			pageLayout = this.container.pageLayout;
			
		var stand = this.stand = (this.num - this.container.pageStart) % pageLayout;
		
		version = version || 'original';
		this.bounds = bounds = bounds || {
			x: this.container.width * scale / pageLayout,
			y: this.container.height * scale
		};

		// Calculate best fit canvas size
		var docSize = {x: this.doc.width, y: this.doc.height},
			sizeRel = {x: docSize.x / bounds.x, y: docSize.y / bounds.y},
			size = (sizeRel.x > sizeRel.y) // select best boundary
				? {x: bounds.x, y: docSize.y / sizeRel.x} // stretch by x
				: {x: docSize.x / sizeRel.y, y: bounds.y}; // stretch by y
		
		if (this.version == version && this.width == size.x && this.height == size.y) {
			this.position();
			this.doc = null;
			return;
		}
			
		this.version = version;
		this.width = size.x.floor();
		this.height = size.y.floor();
		
		var current = this.canvasList[this.version];
		if (current && current.width == this.width && current.height == this.height) {
			this.onRenderComplete();
			this.doc = null;
			return this;
		}
		
		// Clean up old version
		if (current) current = current.destroy();
			
		var canvas = Element('canvas'),
			context = canvas.getContext('2d');
		
		// Prepare canvas 
		canvas.width = this.width;
		canvas.height = this.height;
		
		this.position();
		
		this.running.push(this.version);
		this.container.running++;
		
		this.canvasList[this.version] = canvas;
		
		// Render PDF page into canvas context
		console.time('doc.startRendering ' + this.num + ' / ' + this.version);
		this.doc.startRendering(context, this.onRenderComplete.bind(this));
		this.doc = null;
		
		// if (useWorker) {
			// this.injectRender();
		// }
		
		return this;
	},
	
	onRenderComplete: function() {
		console.timeEnd('doc.startRendering ' + this.num + ' / ' + this.version);
		
		this.running.erase(this.version);
		
		this.injectRender();
	},
	
	position: function() {
		if (this.bounds.positioned) return;
		
		var pageLayout = this.container.pageLayout,
			percentages = {
				x: (this.width / this.bounds.x / this.container.pageLayout * 100),
				y: (this.height / this.bounds.y * 100)
			}, styles = {
				width: percentages.x + '%',
				height: percentages.y + '%',
				top: ((100 - percentages.y) / 2) + '%'
			};
		
		if (this.container.pageLayout == 1) {
			styles.left = ((100 - percentages.x) / 2) + '%';
		} else {
			styles[(this.stand) ? 'left' : 'right'] = 50 + '%';
		}
		
		this.element.setStyles(styles);
		
		this.bounds.positioned = true;
	},
	
	injectRender: function() {
		if (this.canvasList[this.version].parentNode) return;
		
		this.canvasList[this.version].inject(this.element);
		Object.each(this.canvasList, function(canvas, version) {
			if (this.version != version) {
				canvas.dispose();
			}
		}, this);
	}

}); // end PR.Page


// improving-interface-design-29757.pdf
// 69309864-KPCB-Internet-Trends-2011.pdf
// CLX079811_Replica.extract.pdf
// html5apis-wherenomanhasgonebefore-parisweb-111013050140-phpapp02.pdf
// mozilla_dnt-field-guide.pdf
// innovation5-0pdf-111028111543-phpapp02.pdf

new PR.Container('samples/compressed.tracemonkey-pldi-09.pdf');

// html5apis-wherenomanhasgonebefore-parisweb-111013050140-phpapp02.pdf
// 326077-World-Population-Datasheet-2007.pdf
// How to Survive Zombies.pdf
// stevequotes-111006053709-phpapp01.pdf
// slidesthatrockpdf-111012082418-phpapp02.pdf
