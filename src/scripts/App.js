import 'bootstrap/dist/css/bootstrap.css';
import 'jquery-flexdatalist/jquery.flexdatalist.css';
import '../libs/jquery.bootstrapvalidator/bootstrapValidator.css';
import '../devtools/panel.css';
import 'bootstrap/dist/js/bootstrap';
import * as browser from 'webextension-polyfill';
import StoreDevtools from './StoreDevtools';
import SitemapController from './Controller';
import TalismanStoreDevtools from './TalismanStoreDevtools';

$(async function () {
	// init bootstrap alerts
	$('.alert').alert();
	const request = {
		getStorageType: true,
	};
	const storageType = await browser.runtime.sendMessage(request);
	new SitemapController(
		storageType === 'StoreTalismanApi'
			? new TalismanStoreDevtools(storageType)
			: new StoreDevtools(storageType),
		'views/'
	);
});
