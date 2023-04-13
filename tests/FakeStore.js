const FakeStore = function () {
	this.data = [];
};

FakeStore.prototype = {
	writeDocs(data, callback) {
		data.forEach(
			function (data) {
				this.data.push(data);
			}.bind(this)
		);
		callback();
	},

	initSitemapDataDb(sitemapId, callback) {
		callback(this);
	},

	saveSitemap(sitemap, callback) {
		callback(this);
	},
};
