import * as browser from 'webextension-polyfill';
import getContentScript from '../scripts/ContentScript';
import DataExtractor from '../scripts/DataExtractor';
import initVersionEventAPI from '../scripts/VersionEventAPI';
import './content_script.css';

let extractDataInterval;
// 提交抓取数据到后台的url
// const commitUrl = 'http://127.0.0.1:8080/test';
// 抓取数据的间隔(ms)
const timeInterval = 30000;
let taskId;
let serverName;
let platformServer;
browser.runtime.onMessage.addListener(request => {
	// eslint-disable-next-line consistent-return
	return new Promise(resolve => {
		if (request.extractData) {
			console.log('received data extraction request', request);
			const extractor = new DataExtractor(request);
			const deferredData = extractor.getData();
			deferredData.done(function(data) {
				console.log('dataextractor data', data);
				const { selectors } = extractor.sitemap;
				resolve(data, selectors);
			});
			return true;
		}
		// 自定义接受后台请求并抓取数据
		if (request.extractDataSelf) {
			taskId = request.taskId;
			serverName = request.serverName;
			platformServer = request.platformServer;
			const extract = function() {
				console.log('received data extraction request', request);
				const extractor = new DataExtractor(request);
				const deferredData = extractor.getData();
				deferredData.done(function(data) {
					console.log('dataextractor data', data);
					// eslint-disable-next-line no-use-before-define
					sendPostRequest(request.extractCommitUrl, data, taskId, serverName, platformServer);
				});
			};
			extract();
			extractDataInterval = setInterval(extract, timeInterval);
			return true;
		}
		// 停止抓取数据
		// if (request.stopExtractData) {
		// 	// eslint-disable-next-line no-unused-expressions
		// 	extractDataInterval && clearInterval(extractDataInterval);
		// 	window.close();
		// }
		if (request.previewSelectorData) {
			console.log('received data-preview extraction request', request);
			const extractor = new DataExtractor(request);
			const deferredData = extractor.getSingleSelectorData(
				request.parentSelectorIds,
				request.selectorId,
			);
			deferredData.done(function(data) {
				console.log('dataextractor data', data);
				const { selectors } = extractor.sitemap;
				resolve(data, selectors);
			});
			return true;
		}
		// Universal ContentScript communication handler
		if (request.contentScriptCall) {
			const contentScript = getContentScript('ContentScript');

			console.log('received ContentScript request', request);

			const deferredResponse = contentScript[request.fn](request.request);
			deferredResponse.done(function(response) {
				resolve(response, null);
			});

			return true;
		}
	});
});

initVersionEventAPI();

// eslint-disable-next-line no-unused-vars,no-shadow
function sendPostRequest(commitUrl, data, taskId, serverName, platformServer) {
	const ajax = new Ajax();
	const params = {
		type: 'POST',
		url: commitUrl,
		questring: JSON.stringify({
			taskId,
			platformServer,
			serverName,
			extractData: JSON.stringify(data).toString(),
		}).toString(),
	};
	ajax.send(params)
		.then(function(resp) {
			console.log('提交抓取信息的返回信息：', resp);
		})
		.catch(function(err) {
			console.log('提交抓取信息的错误信息:', err);
		});
}

class Ajax {
	constructor(xhr) {
		xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP');
		this.xhr = xhr;
	}

	send(options) {
		const { xhr } = this;

		const opt = {
			type: options.type || 'GET',
			url: options.url || '',
			async: options.async || 'true',
			dataType: options.dataType || 'json',
			questring: options.questring || '',
		};

		return new Promise((resolve, reject) => {
			xhr.open(opt.type, opt.url, opt.async);

			xhr.onreadystatechange = () => {
				if (xhr.readyState === 4) {
					if (xhr.status === 200) {
						if (opt.dataType === 'json') {
							// const data = JSON.parse(xhr.responseText);
							const data = xhr.responseText;
							resolve(data);
						}
					} else {
						reject(new Error(xhr.status || 'Server is fail.'));
					}
				}
			};
			xhr.onerror = () => {
				reject(new Error(xhr.status || 'Server is fail.'));
			};
			// xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
			xhr.setRequestHeader('Content-type', 'application/json;charset-UTF-8');
			xhr.send(opt.questring);
		});
	}
}

// 关闭前发送消息到background
window.onbeforeunload = function() {
	if (extractDataInterval !== undefined) {
		const browserId = taskId + platformServer + serverName;
		const message = { closeTab: true, browserId };
		browser.runtime.sendMessage(message);
	}
};
// // 禁止F5刷新
// document.onkeydown = function(event) {
// 	if (event.keyCode === 116) {
// 		event.keyCode = 0;
// 		event.cancelBubble = true;
// 		return false;
// 	}
// };

//禁止用F5键
document.onkeydown = function(e){
	e = window.event || e;
	var keycode = e.keyCode || e.which;
	if(keycode == 116){
		if(window.event){// ie
			try{e.keyCode = 0;}catch(e){}
			e.returnValue = false;
		}else{// firefox
			e.preventDefault();
		}
	}
}
