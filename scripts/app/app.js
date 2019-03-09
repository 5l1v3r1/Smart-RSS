/**
 * @module App
 */
define([
        'controllers/comm',
        'layouts/Layout', 'jquery', 'domReady!', 'collections/Actions', 'layouts/FeedsLayout', 'layouts/ArticlesLayout',
        'layouts/ContentLayout', 'staticdb/shortcuts', 'modules/Locale', 'preps/all'
    ],
    function (comm, Layout, $, doc, Actions, FeedsLayout, ArticlesLayout, ContentLayout, shortcuts, Locale) {

        document.documentElement.style.fontSize = bg.settings.get('uiFontSize') + '%';

        var templates = $('script[type="text/template"]');
        templates.each(function (i, el) {
            el.innerHTML = Locale.translateHTML(el.innerHTML);
        });

        document.addEventListener('contextmenu', function (e) {
            if (!e.target.matchesSelector('#region-content header, #region-content header *')) {
                e.preventDefault();
            }
        });

        var app = window.app = new (Layout.extend({
            el: 'body',
            fixURL: function (url) {
                if (url.search(/[a-z]+:\/\//) === -1) {
                    url = 'http://' + url;
                }
                return url;
            },
            events: {
                'mousedown': 'handleMouseDown',
                'click #panel-toggle': 'handleClickToggle'
            },
            initialize: function () {
                this.actions = new Actions();

                window.addEventListener('blur', function (e) {
                    this.hideContextMenus();

                    if (e.target instanceof window.Window) {
                        comm.trigger('stop-blur');
                    }

                }.bind(this));

                bg.settings.on('change:layout', this.handleLayoutChange, this);
                bg.settings.on('change:panelToggled', this.handleToggleChange, this);
                bg.sources.on('clear-events', this.handleClearEvents, this);

                if (bg.settings.get('enablePanelToggle')) {
                    $('#panel-toggle').css('display', 'block');
                }
            },
            handleClearEvents: function (id) {
                if (window == null || id === tabID) {
                    bg.settings.off('change:layout', this.handleLayoutChange, this);
                    bg.settings.off('change:panelToggled', this.handleToggleChange, this);
                    bg.sources.off('clear-events', this.handleClearEvents, this);
                }
            },
            handleLayoutChange: function () {
                if (bg.settings.get('layout') === 'vertical') {
                    this.layoutToVertical();
                    this.articles.enableResizing(bg.settings.get('layout'), bg.settings.get('posC'));
                } else {
                    this.layoutToHorizontal();
                    this.articles.enableResizing(bg.settings.get('layout'), bg.settings.get('posB'));
                }
            },
            layoutToVertical: function () {
                $('.regions .regions').addClass('vertical');
            },
            layoutToHorizontal: function () {
                $('.regions .regions').removeClass('vertical');
            },

            /**
             * Saves the panel toggle state (panel visible/hidden)
             * @method handleClickToggle
             */
            handleClickToggle: function () {
                bg.settings.save('panelToggled', !bg.settings.get('panelToggled'));
            },

            /**
             * Shows/hides the panel
             * @method handleToggleChange
             */
            handleToggleChange: function () {
                this.feeds.$el.toggleClass('hidden', !bg.settings.get('panelToggled'));
                $('#panel-toggle').toggleClass('toggled', bg.settings.get('panelToggled'));

                if (!bg.settings.get('panelToggled')) {
                    this.feeds.disableResizing();
                } else {
                    this.feeds.enableResizing('horizontal', bg.settings.get('posA'));
                }
            },
            handleMouseDown: function (e) {
                if (!e.target.matchesSelector('.context-menu, .context-menu *, .overlay, .overlay *')) {
                    this.hideContextMenus();
                }
            },
            hideContextMenus: function () {
                comm.trigger('hide-overlays', {blur: true});
            },
            focusLayout: function (e) {
                this.setFocus(e.currentTarget.getAttribute('name'));
            },
            start: function () {
                this.attach('feeds', new FeedsLayout);
                this.attach('articles', new ArticlesLayout);
                this.attach('content', new ContentLayout);


                this.handleToggleChange();

                this.trigger('start');
                this.trigger('start:after');

                setTimeout(function (that) {
                    $('body').removeClass('loading');
                    that.setFocus('articles');
                    that.handleLayoutChange();

                }, 0, this);
            },
            handleKeyDown: function (e) {
                let activeElement = document.activeElement;

                if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                    return;
                }

                var shortcut = '';
                if (e.ctrlKey) {
                    shortcut += 'ctrl+';
                }
                if (e.shiftKey) {
                    shortcut += 'shift+';
                }


                if (e.keyCode > 46 && e.keyCode < 91) {
                    shortcut += String.fromCharCode(e.keyCode).toLowerCase();
                } else if (e.keyCode in shortcuts.keys) {
                    shortcut += shortcuts.keys[e.keyCode];
                } else {
                    return;
                }

                let activeRegion = activeElement.parentNode.parentNode;
                var activeRegionName = activeRegion.getAttribute('name');
                if (activeRegionName && activeRegionName in shortcuts) {
                    if (shortcut in shortcuts[activeRegionName]) {
                        app.actions.execute(shortcuts[activeRegionName][shortcut], e);
                        e.preventDefault();
                        return false;
                    }
                }

                if (shortcut in shortcuts.global) {
                    app.actions.execute(shortcuts.global[shortcut], e);
                    e.preventDefault();
                    return false;
                }
            }
        }));

        // Prevent context-menu when alt is pressed
        document.addEventListener('keyup', function (e) {
            if (e.keyCode === 18) {
                e.preventDefault();
            }
        });


        document.addEventListener('keydown', app.handleKeyDown);


        return app;
    });