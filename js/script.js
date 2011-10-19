require.config({
	baseUrl: 'js',
	paths: {
		'mootools': 'https://ajax.googleapis.com/ajax/libs/mootools/1.4.1/mootools'
	}
});

define(['mootools'], function() {
	
	var canvas = document.getElementById('canvas'),
		context = canvas.getContext('2d');
		pdf = null;
	
	var pageNum = 1, scale = 1;
	
	window.addEvent('keyup', function(evt) {
		switch (evt.key) {
			case 'left':
				pageNum -= 1;
				break;
			case 'right':
				pageNum += 1;
				break;
			case 'up':
				scale -= 0.1;
				break;
			case 'down':
				scale += 0.1;
				break;
			default:
				return;
		}
		
		evt.preventDefault();
		adjust();
	});
	
	function adjust() {
		//
		// Instantiate PDFDoc with PDF data
		//
		var page = pdf.getPage(pageNum);
		
		console.log(page.stats)
		

		//
		// Prepare canvas using PDF page dimensions
		//
		
		canvas.height = page.height * scale;
		canvas.width = page.width * scale;

		//
		// Render PDF page into canvas context
		//
		page.startRendering(context, function() {
			console.log(arguments);
		});
	}

	getPdf('samples/CLX079811_Replica.compressed.pdf', function getPdfHelloWorld(data) {
		pdf = new PDFDoc(data);
		adjust();
	});

});