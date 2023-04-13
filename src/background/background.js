import * as browser from 'webextension-polyfill';
import urlJoin from 'url-join';
import Config from '../scripts/Config';
import StorePouchDB from '../scripts/StorePouchDB';
import StoreRestApi from '../scripts/StoreRestApi';
import StoreTalismanApi from '../scripts/StoreTalismanApi';
import Sitemap from '../scripts/Sitemap';
import Queue from '../scripts/Queue';
import ChromePopupBrowser from '../scripts/ChromePopupBrowser';
import Scraper from '../scripts/Scraper';
import getBackgroundScript from '../scripts/BackgroundScript';

const config = new Config();
let store;
let webSocket;
const webSocketUrl = 'ws://localhost:8080/websocket/';
console.log('进入backgroud.js');
openSocket();
// eslint-disable-next-line no-use-before-define
setInterval(openSocket, 1000 * 60 * 2);
async function talismanAuthListener(responseDetails) {
	async function reloadTabs() {
		const openTabs = await browser.tabs.query({ url: urlJoin(config.talismanApiUrl, '/*') });
		openTabs.forEach(tab => {
			if (tab.id !== responseDetails.tabId) {
				browser.tabs.reload(tab.id);
			}
		});
	}

	const loginUrl = urlJoin(config.talismanApiUrl, '/oauth/login');
	const logoutUrl = urlJoin(config.talismanApiUrl, '/oauth/logout');
	if (responseDetails.url === loginUrl || responseDetails.url === logoutUrl) {
		await reloadTabs();
		if (responseDetails.tabId !== -1) {
			await browser.runtime.sendMessage({ authStatusChanged: true });
		}
	}
}

function setStore() {
	browser.webRequest.onCompleted.removeListener(talismanAuthListener);
	if (config.storageType === 'rest') {
		store = new StoreRestApi(config, config.restUrl);
	} else if (config.storageType === 'talisman') {
		store = new StoreTalismanApi(config, config.talismanApiUrl);
		browser.webRequest.onCompleted.addListener(talismanAuthListener, {
			urls: [urlJoin(config.talismanApiUrl, '/oauth/*')],
		});
	} else {
		store = new StorePouchDB(config);
	}
}

config.loadConfiguration().then(() => {
	console.log('initial configuration', config);
	setStore();
});

browser.storage.onChanged.addListener(function () {
	config.loadConfiguration().then(async () => {
		console.log('configuration changed', config);
		setStore();
	});
});

const sendToActiveTab = function (request, callback) {
	browser.tabs
		.query({
			active: true,
			currentWindow: true,
		})
		.then(tabs => {
			if (tabs.length < 1) {
				this.console.log("couldn't find active tab");
			} else {
				const tab = tabs[0];
				browser.tabs.sendMessage(tab.id, request).then(callback).catch(callback);
			}
		});
};

// eslint-disable-next-line consistent-return
browser.runtime.onMessage.addListener(async request => {
	console.log('--------background.js---listener-------request:', request);
	if (request.getStandName) {
		return store.standName;
	}

	if (request.getStorageType) {
		return store.constructor.name;
	}

	if (request.login) {
		return store.initTalismanLogin(request.credential);
	}

	if (request.logOut) {
		return await store.logOut();
	}

	if (request.isAuthorized) {
		const storeData = await store.isAuthorized();
		return storeData ? { data: storeData } : false;
	}

	if (request.createSitemap) {
		if (request.projectId) {
			return store.createSitemap(request.sitemap, request.projectId);
		}
		return store.createSitemap(request.sitemap);
	}

	if (request.saveSitemap) {
		if (request.projectId) {
			return store.saveSitemap(request.sitemap, request.previousSitemapId, request.projectId);
		}
		return store.saveSitemap(request.sitemap, request.previousSitemapId);
	}

	if (request.deleteSitemap) {
		if (request.projectId) {
			return store.deleteSitemap(request.sitemap, request.projectId);
		}
		return store.deleteSitemap(request.sitemap);
	}

	if (request.getAllSitemaps) {
		if (request.projectId) {
			return store.getAllSitemaps(request.projectId);
		}
		return store.getAllSitemaps();
	}

	if (request.getAllProjects) {
		return store.getAllProjects();
	}

	if (request.sitemapExists) {
		if (request.projectId) {
			return store.sitemapExists(request.sitemapId, request.projectId);
		}
		return store.sitemapExists(request.sitemapId);
	}

	if (request.getSitemapData) {
		return store.getSitemapData(Sitemap.sitemapFromObj(request.sitemap));
	}
	// 监听抓取事件
	if (request.scrapeSitemap) {
		const sitemap = Sitemap.sitemapFromObj(request.sitemap);
		const queue = new Queue();
		// 创建弹出页面的实例
		const browserTab = new ChromePopupBrowser({
			pageLoadDelay: request.pageLoadDelay,
		});

		const scraper = new Scraper({
			queue,
			sitemap,
			browser: browserTab,
			store,
			requestInterval: request.requestInterval,
			requestIntervalRandomness: request.requestIntervalRandomness,
			pageLoadDelay: request.pageLoadDelay,
		});
		console.log('执行scraper.run前');
		return new Promise(resolve => {
			try {
				scraper.run(function () {
					// 数据抓取完成后，关闭弹出的浏览器
					browserTab.close();
					browser.notifications.create('scraping-finished', {
						type: 'basic',
						iconUrl: 'assets/images/icon128.png',
						title: 'Scraping finished!',
						message: `Finished scraping ${sitemap._id}`,
					});
					// table selector can dynamically add columns (addMissingColumns Feature)
					resolve(sitemap.selectors);
				});
			} catch (e) {
				console.log('Scraper execution cancelled', e);
			}
		});
	}

	if (request.previewSelectorData) {
		const tabs = await browser.tabs.query({ active: true, currentWindow: true });
		if (tabs.length < 1) {
			this.console.log("couldn't find active tab");
		} else {
			const tab = tabs[0];
			return browser.tabs.sendMessage(tab.id, request);
		}
	} else if (request.backgroundScriptCall) {
		return new Promise((resolve, reject) => {
			const backgroundScript = getBackgroundScript('BackgroundScript');
			// TODO change to promises
			const deferredResponse = backgroundScript[request.fn](request.request);
			deferredResponse.done(resolve).catch(reject);
		});
	}
	if (request.closeTab) {
		console.log('收到某页面关闭消息:', request);
		// eslint-disable-next-line no-use-before-define
		browserCache.delete(request.browserId);
		// browserCache[request.browserId] = null;
		// eslint-disable-next-line no-use-before-define
		console.log('关闭{}后的browserCache：{}', request.browserId, browserCache);
	}
});
// 用于确定指定的某browser是否存在
let browserCache = new Map();
// 开启WebSocket
function openSocket() {
	if (typeof WebSocket === 'undefined') {
		console.log('浏览器不支持WebSocket');
	} else if (webSocket == null) {
		// eslint-disable-next-line no-use-before-define
		const UUID = generateUuid();
		const socketUrl = webSocketUrl + UUID;
		webSocket = new WebSocket(socketUrl);
		webSocket.onopen = function () {
			console.log('与服务端建立连接');
			// eslint-disable-next-line no-use-before-define
			sendSocketMessage(`${UUID}连接服务端`);
		};
		webSocket.onmessage = function (msg) {
			console.log('接收的信息：', msg.data);
			const task = JSON.parse(msg.data);
			const { taskId } = task;
			const { serverName } = task;
			const { platformServer } = task;
			const browserId = taskId + platformServer + serverName;
			// const browserTab = browserCache[browserId];
			console.log('browserId:', browserId);
			console.log('browserCache:', browserCache);
			// 开始抓取数据 已经存在的任务，直接忽视
			if (task.operType === 'START' && browserCache.get(browserId) == null) {
				// eslint-disable-next-line no-use-before-define
				extractData(task);
			} else if (task.operType === 'STOP') {
				console.log('进入了Stop：{}', browserCache);
				// 关闭所有以taskId开始的页面
				browserCache.forEach((v, k) => {
					if (k.indexOf(taskId) !== -1) {
						v.close();
						browserCache.delete(k);
					}
				});
				// 暂停抓取数据 直接关闭抓取页面
				// browserCache[browserId] = null;
				// browserTab.close();
			}
		};
		webSocket.onclose = function () {
			console.log('WebSocket连接关闭');
			webSocket = null;
		};
		webSocket.onerror = function (error) {
			console.log('WebSocket报错：', error);
		};
	}
}
function sendSocketMessage(obj) {
	webSocket.send(JSON.stringify(obj).toString());
}
function extractData(task) {
	const { taskId } = task;
	const { extractCommitUrl } = task;
	const { siteMap } = task;
	const { serverName } = task;
	const { platformServer } = task;
	// 创建弹出页面的实例
	const browserTab = new ChromePopupBrowser({
		pageLoadDelay: 2000,
	});
	// 缓存页面
	const browserId = taskId + platformServer + serverName;
	browserCache.set(browserId, browserTab);

	const sitemap = JSON.parse(siteMap);
	console.log('解析后的siteMap:', sitemap);
	const urls = sitemap.startUrls;
	const parentSelector = sitemap.rootSelector.uuid;
	urls.forEach(function (url) {
		browserTab.fetchDataSelf(url, sitemap, parentSelector, extractCommitUrl, taskId, serverName, platformServer);
	});
}
// function stopExtractData() {
// 	const message = {
// 		stopExtractData: true,
// 	};
// 	browser.tabs.sendMessage(browserTab.tab.id, message);
// }
// 生成UUid
function generateUuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		var r = Math.random() * 16 | 0,
			v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}


