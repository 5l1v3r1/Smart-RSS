RegExp.escape = function(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
};

Array.prototype.last = function() {
	if (!this.length) return null;
	return this[this.length - 1];
}

Array.prototype.first = function() {
	if (!this.length) return null;
	return this[0];
}

chrome.runtime.getBackgroundPage(function(bg) {

$(function() {
	var ItemView = Backbone.View.extend({
		tagName: 'div',
		className: 'item',
		template: _.template($('#template-item').html()),
		events: {
			'mousedown': 'handleMouseDown'
		},
		initialize: function() {
			this.model.on('change', this.handleModelChange, this);
			this.model.on('destroy', this.handleModelDestroy, this);
			this.el.view = this;
		},
		render: function() {
			this.$el.toggleClass('unread', this.model.get('unread'));
			this.$el.html(this.template(this.model.toJSON()));
			return this;
		},
		select: function(e) {
			e = e || {};
			if (e.shiftKey != true && e.ctrlKey != true) {
				list.selectedItems = [];
				$('.selected').removeClass('selected');
				if (!e.preventLoading) {
					//bg.items.trigger('new-selected', this.model);
					window.top.frames[2].postMessage({ action: 'new-select', value: this.model.id }, '*');
				}
			} else if (e.shiftKey && list.selectedItems.length) {
				$('.selected').removeClass('selected');
				list.selectedItems = [list.selectedItems[0]];
				list.selectedItems[0].$el.addClass('selected');

				if (list.selectedItems[0].model.get('date') > this.model.get('date')) {
					list.selectedItems[0].$el.nextUntil(this.$el).not('.invisible').each(function(i, el) {
						$(el).addClass('selected');
						list.selectedItems.push(el.view);
					});
				} else {
					this.$el.nextUntil(list.selectedItems[0].$el).not('.invisible').each(function(i, el) {
						$(el).addClass('selected');
						list.selectedItems.push(el.view);
					});
				}
			}

			$('.last-selected').removeClass('last-selected');

			list.selectedItems.push(this);
			this.$el.addClass('selected');
			this.$el.addClass('last-selected');
		},
		handleMouseDown: function(e) {
			this.select({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey });
		},
		handleModelChange: function() {
			if (this.model.get('deleted')) {
				list.removeItem(this);
			} else {
				this.render();
			}
		},
		handleModelDestroy: function(e) {
			list.destroyItem(this);
		}
	});

	var toolbar = new (Backbone.View.extend({
		el: '#toolbar',
		events: {
			'click #button-read': 'handleButtonRead',
			'click #button-reload': 'refreshItems',
			'click #button-delete': 'handleButtonDelete',
			'input input[type=search]': 'handleSearch'
		},
		initialize: function() {
			
		},
		handleButtonRead: function() {
			list.changeUnreadState();
		},
		refreshItems: function() {
			if (list.currentSource) {
				// need to add listener for source destroy to prevent loading deleted source
				bg.downloadOne(list.currentSource);	
			} else {
				bg.downloadAll();
			}
			
		},
		handleSearch: function(e) {
			var str = e.currentTarget.value || '';
			var searchInContent = false;
			if (str[0] && str[0] == ':') {
				str = str.replace(/^:/, '', str);
				searchInContent = true;
			}
			var rg = new RegExp(RegExp.escape(str), 'i');
			list.views.forEach(function(view) {
				if (rg.test(view.model.get('title')) || rg.test(view.model.get('author')) || (searchInContent && rg.test(view.model.get('content')) )) {
					view.$el.removeClass('invisible');
				} else {
					view.$el.addClass('invisible');
				}
			});

			list.restartSelection();
		},
		handleButtonDelete: function() {
			list.selectedItems.forEach(list.removeItem, list);
		}
	}));

	var list = new (Backbone.View.extend({
		el: '#list',
		selectedItems: [],
		views: [],
		currentSource: null,
		events: {
			
		},
		initialize: function() {
			var that = this;
			bg.items.on('reset', this.addItems, this);
			bg.items.on('add', this.addItem, this);
			window.addEventListener('message', function(e) {
				if (e.data.action == 'new-select') {
					that.handleNewSelected(bg.sources.findWhere({ id: e.data.value }));
				}
			});
			this.addItems(bg.items);
		},
		addItem: function(item, noManualSort) {
			if (!item.get('deleted')) {
				var view = new ItemView({ model: item });


				var after = null;
				if (noManualSort !== true) {
					$.makeArray($('#list .item')).some(function(itemEl) {
						if (itemEl.view.model.get('date') < item.get('date')) {
							after =  itemEl;
							return true;
						}
					});
				}

				if (!after) {
					this.$el.append(view.render().$el);	
				} else {
					//$(after).insertBefore(view.render().$el);
					view.render().$el.insertBefore($(after));
				}

				this.views.push(view);
			}
		},
		addItems: function(items) {
			// better solution?
			this.views.forEach(this.destroyItem, this);
			this.views = [];

			$('#list').html('');
			items.forEach(function(item) {
				this.addItem(item, true);
			}, this);

			setTimeout(function() {
				//if (list.views[0]) list.views[0].select();
				list.selectFirst();
			}, 0);
		},
		handleNewSelected: function(source) {
			if (this.currentSource) {
				this.currentSource.off('destroy', this.handleDestroyedSource, this);
			}
			this.currentSource = source;
			source.on('destroy', this.handleDestroyedSource, this);
			this.addItems(bg.items.where({ sourceID: source.id }));
			
		},
		handleDestroyedSource: function() {
			this.currentSource = null;
			this.addItems(bg.items);	
		},
		removeItem: function(view) {
			view.model.save({
				'deleted': true,
				'content': '',
				'author': '',
				'title': ''
			});
			this.destroyItem(view);
		},
		destroyItem: function(view) {
			view.undelegateEvents();
			view.$el.removeData().unbind(); 
			view.off();
			view.remove();
			
			var io = list.selectedItems.indexOf(this);
			if (io >= 0) list.selectedItems.splice(io, 1);
			io = list.views.indexOf(this);
			if (io >= 0) list.views.splice(io, 1);
		},
		restartSelection: function() {
			if (this.selectedItems.length) {
				this.selectedItems = [];
				$('.selected').removeClass('selected');
				$('.last-selected').removeClass('last-selected');
			}
			this.selectFirst();
		},
		selectFirst: function() {
			var first = $('.item:not(.invisible)').get(0);
			if (first) first.view.select();
		},
		changeUnreadState: function(opt) {
			var opt = opt || {};
			var val = list.selectedItems.length ? !list.selectedItems[0].model.get('unread') : false;
			list.selectedItems.forEach(function(item) {
				if (opt.onlyToRead && item.model.get('unread') == false) {
					// do nothing
				} else {
					item.model.save({ unread: val });	
				}
				
			}, this);
		}
	}));

	var app = new (Backbone.View.extend({
		el: 'body',
		events: {
			'keydown': 'handleKeyDown'
		},
		initialize: function() {
		},
		selectNext: function(e) {
			var e = e || {};
			var q = e.selectUnread ? '.unread:not(.invisible):first' : '.item:not(.invisible):first';
			var next = $('.last-selected').nextAll(q);
			if (!next.length) next = $('.item:not(.invisible):first');
			if (next.length) {
				next.get(0).view.select(e);
				next.get(0).scrollIntoView(false);
			} 
		},
		handleKeyDown: function(e) {
			if (e.keyCode == 68) {
				list.selectedItems.forEach(list.removeItem, list);
			} else if (e.keyCode == 75) {
				toolbar.handleButtonRead();
			} else if (e.keyCode == 40) {
				this.selectNext(e);
			} else if (e.keyCode == 71) {
				list.changeUnreadState({ onlyToRead: true });
				this.selectNext({ selectUnread: true });
			} else if (e.keyCode == 38) {
				var prev = $('.last-selected').prevAll('.item:not(.invisible):first');
				if (!prev.length) prev = $('.item:not(.invisible):last');
				if (prev.length) {
					prev.get(0).view.select(e);
					prev.get(0).scrollIntoView(false);
				}
			}

			if (e.keyCode > 30 && e.keyCode < 120 && e.keyCode != 73) {
				e.preventDefault();
			}
		} 
	}));
});


});