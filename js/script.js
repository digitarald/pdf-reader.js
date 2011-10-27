/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// 'use strict';

require.config({
	baseUrl: 'js',
	paths: {
		'mootools': 'https://ajax.googleapis.com/ajax/libs/mootools/1.4.1/mootools'
	}
});

var PR = {};

define(['mootools'], function() {

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
		if ('ontouchstart' in document.documentElement) return {
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
				window.addEvent('orientationchange', this.onResize.bind(this));
			} else {
				window.addEvent('dblclick', this.onDblClick.bind(this));
			}

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
				label.set('text', 'Processing …');
				
				var buffer = xhr.mozResponseArrayBuffer || xhr.responseArrayBuffer || new Uint8Array(xhr.response);
				xhr = null;

				this.doc = new PDFJS.PDFDoc(buffer);
				
				label.set('text', 'Rendering …');
				
				this.setup();
				
				status.destroy();
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
			
			var previousLayout = this.pageLayout;
			this.pageLayout = (this.width > this.height) ? 2 : 1;
			this.pageNum - (this.pageNum - this.pageStart) % 2;
			
			if (!this.ready) return;
			
			if (previousLayout != this.pageLayout)
				this.render();
			else
				this.updateRender();
		},

		render: function() {
			if (this.previousContainer) this.previousContainer.destroy();
			this.previousContainer = this.currentContainer;
			
			var container = this.currentContainer = new Element('div', {
				'class': 'page-container animated'
			}),
				innerContainer = new Element('div', {'class': 'page-container-inner'}).inject(container);
			
			if (this.previousContainer) {
				container.setStyle(css3Support.transformStyle, 'translate(500px, 0)');
			}
			
			for (var i = 0; i < this.pageLayout; i++) {
				var page = this.pageList[this.pageNum + i];
				if (!page) continue; // TODO: add empty page?
				
				page.render();
				page.element.inject(innerContainer);
			}
			
			container.inject(this.element);
			container.offsetWidth;
			container.setStyle(css3Support.transformStyle, 'translate(0px)');

			container.addEventListener(css3Support.transitionEndEvent, function(evt) {
				if (!this.previousContainer)
					return;
				
				// Keep page references intact
				this.previousContainer.getElements('canvas').dispose();
				
				this.previousContainer.destroy();
				this.previousContainer = null;
				
				this.renderPreemptive();
				
			}.bind(this), false);
		},
		
		updateRender: function() {
			for (var i = 0; i < this.pageLayout; i++) {
				var page = this.pageList[this.pageNum + i];
				if (!page) continue; // TODO: add empty page?
				page.render((this.scale == 1) ? 'original' : 'zoom');
			}
		},
		
		renderPreemptive: function() {
			return null; // TODO: Unskip?
			
			for (var i = 0; i < this.pageLayout; i++) {
				var page = this.pageList[this.pageNum + this.pageLayout + i];
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
		
		pan: function(zoomTo) {
			zoomTo = zoomTo || this.scale;
			
			// correct rendering after zoom
			var endHandler = function(evt) {
				if (!endHandler) return;
				endHandler = null;
				
				this.currentContainer.removeEventListener(css3Support.transitionEndEvent, endHandler, false);
				
				(function() {
					this.updateRender();
					
					if (this.scale > 1) {
					
						this.currentContainer.removeClass('animated');
						
						// FIXME use translate for positioning
						var styles = {
							left: (- this.center.x) * this.scale + this.width / 2,
							top: (- this.center.y) * this.scale + this.height / 2,
							width: this.width * this.scale,
							height: this.height * this.scale
						};
						styles[css3Support.transformStyle] = '';
						this.currentContainer.setStyles(styles);
						
						this.currentContainer.offsetLeft; // flush re-flow
						this.currentContainer.addClass('animated');
					}
				}).delay(100, this);
				
			}.bind(this);
			
			// start transition
			if (zoomTo > 1) {
				
				// FIXME align correctly when
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
				
			} else {
				var previousScale = this.scale;
				this.scale = 1;
				
				this.currentContainer.removeClass('animated');
				
				var transform = 'scale({scale}) translate({x}px, {y}px)'.substitute({
					x: this.width / 2 - this.center.x,
					y: this.height / 2 - this.center.y,
					scale: previousScale
				});
				var styles = {left: null, top: null, width: null, height: null};
				styles[css3Support.transformStyle] = transform;
				this.currentContainer.setStyles(styles);
				
				this.currentContainer.offsetLeft; // flush re-flow
				this.currentContainer.addClass('animated');
				
				this.currentContainer.setStyle(css3Support.transformStyle, 'scale(1)');
			}
			
			if (this.currentContainer.getStyle(css3Support.transitionStyle)) {
				this.currentContainer.addEventListener(css3Support.transitionEndEvent, endHandler, false);
			} else {
				endHandler.delay(200);
			}
		},

		onKey: function(evt) {
			if (!this.ready) return;
			
			switch (evt.key) {
			case 'left':
				if (this.scale > 1) {
					this.center.x -= this.width / 10;
					this.pan();
				} else {
					if (this.pageNum <= 1) break;
					this.pageNum -= this.pageLayout;
					this.render();
				}
				break;
			case 'right':
				if (this.scale > 1) {
					this.center.x += this.width / 10;
					this.pan();
				} else {
					if (this.pageNum > this.pageCount - this.pageLayout) break;
					this.pageNum += this.pageLayout;
					this.render();
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
			
			if (previous && touch.time < previous.time + 500) {
				this.triggerZoom(evt.page.x, evt.page.y);
			}
		},
		
		onTouchStart: function(evt) {
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
			
			var scale = this.container.scale;
			
			version = version || 'original';
			bounds = bounds || {
				x: this.container.width * scale / this.container.pageLayout,
				y: this.container.height * scale
			};

			// Calculate best fit canvas size
			var docSize = {x: this.doc.width, y: this.doc.height},
				sizeRel = {x: docSize.x / bounds.x, y: docSize.y / bounds.y},
				size = (sizeRel.x > sizeRel.y) // select best boundary
					? {x: bounds.x, y: docSize.y / sizeRel.x} // stretch by x
					: {x: docSize.x / sizeRel.y, y: bounds.y}; // stretch by y
			
			if (this.version == 'version' && this.width == size.x && this.height == size.y)
				return;
				
			this.version = version;
			this.width = size.x;
			this.height = size.y;
			
			this.element.setStyles({
				width: this.width,
				height: this.height
			});
			
			var current = this.canvasList[this.version];
			if (current && current.width == this.width && current.height == this.height) {
				console.log('PR.Page: SKIPPED render ' + this.num + '-' + version);
				
				this.onRenderComplete();
				return this;
			}
			
			console.log('PR.Page: Render ' + this.num + '-' + version);

			// Clean up old version
			if (current) current = current.destroy();
				
			var canvas = Element('canvas'),
				context = canvas.getContext('2d');
			
			// Prepare canvas 
			canvas.width = this.width;
			canvas.height = this.height;
			
			this.running.push(this.version);
			this.container.running++;
			
			this.canvasList[this.version] = canvas;
			
			// Render PDF page into canvas context
			this.doc.startRendering(context, this.onRenderComplete.bind(this));
			
			return this;
		},
		
		onRenderComplete: function() {
			this.running.erase(this.version);
			
			Object.each(this.canvasList, function(canvas, version) {
				if (this.version == version) {
					canvas.inject(this.element);
				} else {
					canvas.dispose();
				}
			}, this);
		}

	}); // end PR.Page

	new PR.Container('samples/improving-interface-design-29757.pdf');
	
}); // end define
