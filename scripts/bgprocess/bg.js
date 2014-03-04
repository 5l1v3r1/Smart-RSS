/**
 * @module BgProcess
 */
define([
	'jquery',
	'domReady!', 'modules/Animation', 'preps/indexeddb', 'models/Settings', 'models/Info', 'models/Source',
	'collections/Sources', 'collections/Items', 'collections/Folders', 'models/Loader', 'collections/Logs',
	'models/Folder', 'models/Item', 'collections/Toolbars'
],
function ($, doc, animation, dbSuccess, Settings, Info, Source, Sources, Items, Folders, Loader, Logs, Folder, Item, Toolbars) {

	/**
	 * Update animations
	 */
	animation.start();


	/*$.ajaxSetup({
		cache: false
	});*/

	window.appStarted = new (jQuery.Deferred)();
	window.settingsLoaded = new (jQuery.Deferred)();

	/**
	 * Items
	 */
	window.Source = Source;
	window.Item = Item;
	window.Folder = Folder;

	/**
	 * DB models
	 */
	window.settings = new Settings();
	window.info = new Info();
	window.sourceJoker = new Source({ id: 'joker' });
	window.sources = new Sources();
	window.items = new Items();
	window.folders = new Folders();

	window.toolbars = new Toolbars();


	/**
	 * Non-db models & collections
	 */
	window.loader = new Loader();
	window.logs = new Logs();
	logs.startLogging();

	/**
	 * RSS Downloader
	 */
	$.support.cors = true;


	/**
	 * Fetch all
	 */
	function fetchOne(arr, allDef) {
		if (!arr.length) {
			allDef.resolve();
			return;
		}
		var one = arr.shift();
		one.always(function() {
			fetchOne(arr, allDef);
		});
	}

	function fetchAll() {
		var allDef = new (jQuery.Deferred)();
		var deferreds = [];
		var settingsDef;
		deferreds.push(  folders.fetch({ silent: true }) );
		deferreds.push(  sources.fetch({ silent: true }) );
		deferreds.push(    items.fetch({ silent: true }) );
		deferreds.push( toolbars.fetch({ silent: true }) );
		deferreds.push( settingsDef = settings.fetch({ silent: true }) );

		fetchOne(deferreds, allDef)

		settingsDef.always(function() {
			settingsLoaded.resolve();
		});
		

		return allDef.promise();
	}






	/**
	 * Init
	 */


	$(function() {
	fetchAll().always(function() {

		/**
		 * Load counters for specials
		 */

		info.autoSetData();

		/**
		 * Set events
		 */

		sources.on('add', function(source) {
			if (source.get('updateEvery') > 0) {
				chrome.alarms.create('source-' + source.get('id'), {
					delayInMinutes: source.get('updateEvery'),
					periodInMinutes: source.get('updateEvery')	
				});
			}
			loader.downloadOne(source);
		});

		sources.on('change:updateEvery reset-alarm', function(source) {
			if (source.get('updateEvery') > 0) {
				chrome.alarms.create('source-' + source.get('id'), {
					delayInMinutes: source.get('updateEvery'),
					periodInMinutes: source.get('updateEvery')
				});
			} else {
				chrome.alarms.clear('source-' + source.get('id'));
			}
		});

		chrome.alarms.onAlarm.addListener(function(alarm) {
			var sourceID = alarm.name.replace('source-', '');
			if (sourceID) {
				var source = sources.findWhere({
					id: sourceID
				});
				if (source) {
					if (!loader.downloadOne(source)) {
						setTimeout(loader.downloadOne, 30000, source);
					}
				} else {
					console.log('No source with ID: ' + sourceID);
					chrome.alarms.clear(alarm.name);
					debugger;
				}

			}

		});

		sources.on('change:url', function(source) {
			loader.downloadOne(source);
		});

		sources.on('change:title', function(source) {
			// if url was changed as well change:url listener will download the source
			if (!source.get('title')) {
				loader.downloadOne(source);
			}

			sources.sort();
		});

		sources.on('change:hasNew', animation.handleIconChange);
		settings.on('change:icon', animation.handleIconChange);

		info.setEvents(sources);


		/**
		 * Init
		 */


		setTimeout(loader.downloadAll, 30000);
		appStarted.resolve();

		/**
		 * Set icon
		 */

		animation.stop();


		/**
		 * onclick:button -> open RSS
		 */
		chrome.browserAction.onClicked.addListener(function(tab) {
			openRSS(true);
		});

	});
	});

	function openRSS(closeIfActive) {
		var url = chrome.extension.getURL('rss_all.html');
		chrome.tabs.query({
			url: url
		}, function(tabs) {
			if (tabs[0]) {
				if (tabs[0].active && closeIfActive) {
					chrome.tabs.remove(tabs[0].id);
				} else {
					chrome.tabs.update(tabs[0].id, {
						active: true
					});
				}
			} else {
				chrome.tabs.create({
					'url': url
				}, function(tab) {});
			}
		});
	}







	/**
	 * Messages
	 */

	chrome.runtime.onMessageExternal.addListener(function(message, sender, sendResponse) {
		// if.sender.id != blahblah -> return;
		if (!message.hasOwnProperty('action')) {
			return;
		}

		if (message.action == 'new-rss' && message.value) {
			message.value = message.value.replace(/^feed:/i, 'http:');
			sources.create({
				title: message.value,
				url: message.value,
				updateEvery: 180
			}, { wait: true });

			openRSS();

		}
	});

	chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
		if (message.action == 'get-tab-id') {
			sendResponse({
				action: 'response-tab-id',
				value: sender.tab.id
			});
		}
	});

	chrome.runtime.onConnect.addListener(function(port) {
		port.onDisconnect.addListener(function(port) {
			sources.trigger('clear-events', port.sender.tab.id);
		});
	});

});