require.config({
	baseUrl: 'js',
	paths: {
		'mootools': 'https://ajax.googleapis.com/ajax/libs/mootools/1.4.1/mootools'
	}
});

var PR = {};

define(['mootools'], function() {

	PR.Issue = new Class({

		initialize: function(fileURL) {
			this.fileURL = fileURL;

			this.canvas = document.getElementById('canvas');
			this.context = canvas.getContext('2d');

			this.pageNum = this.scale = 1;

			window.addEvent('keyup', function(evt) {
				switch (evt.key) {
				case 'left':
					this.pageNum -= 1;
					break;
				case 'right':
					this.pageNum += 1;
					break;
				case 'up':
					this.scale -= 0.1;
					break;
				case 'down':
					this.scale += 0.1;
					break;
				default:
					return;
				}

				evt.preventDefault();
				this.render();
			}.bind(this));

			this.loadFromDatabase();
		},

		loadFromDatabase: function() {
			console.log('loadFromDatabase');

			require(['vendor/mootools-htmlx/Source/IndexedDB/Database', 'vendor/base64'], function() {
				this.db = new Database('pdf-reader', {
					schema: [{
						name: 'issues',
						options: {
							keyPath: 'id'
						}
					}],
					onOpen: function() {
						console.log('onOpen');

						this.db.getObject('issues').retrieve(this.fileURL, function(evt) {

							if (!evt.target.result) {
								console.warn('loadFromDatabase: No result, loading URL');
								this.loadFromURL();
								return;
							}
							
							var data = evt.target.result.data;

							var buffer = new Uint8Array(data.length);
							for ( var i = 0, length = data.length; i < length; i += 1) {
								buffer[i] = data.charCodeAt(i);
							}

							try {
								this.pdfDoc = new PDFDoc(buffer);
							} catch (e) {
								console.warn('loadFromDatabase: Broken result, loading URL');
								// Delete URL from DB
								this.db.getObject('issues').eliminate(this.fileURL);

								this.loadFromURL();
								return;
							}

							console.log('Loaded via Database');
							this.render();
						}.bind(this));
					}.bind(this)

				});

			}.bind(this));
		},

		loadFromURL: function() {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', this.fileURL, true);
			xhr.mozResponseType = xhr.responseType = 'arraybuffer';

			xhr.onload = function(evt) {
				var buffer = xhr.mozResponseArrayBuffer || xhr.responseArrayBuffer || new Uint8Array(xhr.response);

				console.log(buffer, buffer.length);

				var str = new Array(buffer.length);
				for ( var i = 0, length = buffer.length; i < length; i += 1) {
					str[i] = String.fromCharCode(buffer[i]);
				}
				str = str.join('');

				// var reverse = new Uint8Array(str.length);
				// for (var i = 0, length = str.length; i < length; i += 1) {
				// reverse[i] = str.charCodeAt(i);
				// }

				this.db.getObject('issues').store({
					id: this.fileURL,
					data: str,
					added: Date.now(),
					size: str.length
				});

				this.pdfDoc = new PDFDoc(buffer);
				
				console.log('Loaded via URL');
				this.render();
			}.bind(this);

			xhr.send();
		},

		render: function() {
			if (!this.pdfDoc)
				return;

			// Instantiate PDFDoc with PDF data
			this.page = this.pdfDoc.getPage(this.pageNum);

			// Prepare canvas using PDF page dimensions
			this.canvas.height = this.page.height * this.scale;
			this.canvas.width = this.page.width * this.scale;

			// Render PDF page into canvas context
			this.page.startRendering(this.context);
		}

	});

	new PR.Issue('samples/RBK089811_Replica.extract.pdf');

});