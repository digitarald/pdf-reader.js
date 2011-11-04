/**
 * 
 */

PR.DB = new Class({
	
	Implements: Events,
	
	initialize: function() {
		this.callstack = {};
		this.ready = false;
		
		var drivers = PR.DB.Drivers;
		
		for (var key in drivers) {
			var driver = new drivers[key](this);
			if (!driver) continue;
			
			this.drivers[key] = driver;
				
			if (!this.driver) this.driver = driver;
		}
		
		if (this.driver) this.driver.setup();
	},
	
	ready: function() {
		this.ready = true;
		this.fireEvent('ready');
		
		Object.forEach(this.callstack, function(args, method) {
			this[method].apply(this, args);
		}, this);
		this.callstack = {};
		
	},
	
	fallback: function() {
		this.ready = false;
		
		for (var key in this.drivers) {
			var driver = this.drivers[key];
			if (this.driver == driver) {
				this.driver = null;
		 		delete this.drivers[key];
			}
			
			if (!this.driver) this.driver = driver;
		}
		
		if (this.driver) this.driver.setup();
	}
	
});

PR.DB.drivers = {
	
	indexedDB: new Class({
		
		version: '1',
		schema: {
			name: 'storage',
			options: {keyPath: 'key'}
		},
		
		initialize: function() {
			// shortcuts to vendor-prefixed classes
			this.IndexedDB = window.mozIndexedDB || window.webkitIndexedDB || window.IndexedDB || null;
			this.Transaction = window.webkitIDBTransaction || window.IDBTransaction || null;
			
			if (!this.IndexedDB || !this.Transaction) return null;
		},
		
		setup: function() {
			try {
				var openRequest = this.IndexedDB.open(this.schema.name);
			} catch (e) {
				this.onFailure();
				return;
			}
			
			openRequest.onsuccess = function(evt) {
		    this.db = evt.target.result;
		    
		    // First hit, initialize database.
		    if (this.db.version != this.version) {
		    	var versionRequest = this.db.setVersion(version);

					versionRequest.onsuccess = function() {
						if (this.db.objectStoreNames.contains(this.schema.name)) {
							db.deleteObjectStore(this.schema.name);
						}

						var objectStore = this.db.createObjectStore(schema.name, schema.options);

						objectStore.onsuccess = function() {
							this.onReady.bind(this);
						}.bind(this);
						objectStore.onfailure = this.onFailure.bind(this);

						if (this.db.objectStoreNames.contains(this.schema.name)) {
							this.onReady();
						}
					}.bind(this);
					versionRequest.onfailure = this.onFailure.bind(this);

		    } else {
		    	this.onReady();
		    }
		    
			}.bind(this);
			openRequest.onfailure = this.onFailure.bind(this);
		},
		
		tearDown: function() {
			this.db = null;
		},
		
		onReady: function() {
			this.factory.ready();
		},
		
		onFailure: function() {
			this.tearDown();
			this.factory.fallback();
		}
		
	})
	
};