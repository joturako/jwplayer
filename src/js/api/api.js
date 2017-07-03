import instances from 'api/players';

define([
    'events/events',
    'events/states',
    'utils/backbone.events',
    'utils/helpers',
    'utils/timer',
    'utils/underscore',
    'controller/controller',
    'plugins/plugins',
    'version'
], function(events, states,
            Events, utils, Timer, _, Controller, plugins, version) {

    let instancesCreated = 0;

    function setupController(api, element) {
        const controller = new Controller(element);

        // capture the ready event and add setup time to it
        controller.on(events.JWPLAYER_READY, (event) => {
            api._qoe.tick('ready');
            event.setupTime = api._qoe.between('setup', 'ready');
        });
        controller.on('all', (type, event) => {
            api.trigger(type, event);
        });

        return controller;
    }

    function resetPlayer(api, controller) {
        api.off();

        if (controller) {
            controller.off();
            // so players can be removed before loading completes
            if (controller.playerDestroy) {
                controller.playerDestroy();
            }
        }
    }

    function removePlayer(api) {
        for (let i = instances.length; i--;) {
            if (instances[i].uniqueId === api.uniqueId) {
                instances.splice(i, 1);
                break;
            }
        }
    }

    /** Player API */
    return class Api {

        /**
         * Create a player instance.
         * @param {HTMLElement} element - The element that will be replaced by the player's div container.
         */
        constructor(element) {
            // Add read-only properties which access privately scoped data
            // TODO: The alternative to pass this to the controller/model and access it from there
            const uniqueId = instancesCreated++;
            const id = element.id;
            Object.defineProperty(this, 'uniqueId', {
                get: function() {
                    return uniqueId;
                }
            });
            Object.defineProperty(this, 'id', {
                get: function() {
                    return id;
                }
            });

            // Intialize QOE timer
            this._qoe = new Timer();
            this._qoe.tick('init');

            let _controller = setupController(this, element);

            /**
             * Call an internal method on the player's controller.
             * @param {string} name - The method to call.
             * @param {...*} [args] - Any arguments made after the name are passed to the internal method.
             * @return {any} Returns the result or null if the method is undefined.
             */
            this.callInternal = function(name, ...args) {
                if (_controller[name]) {
                    return _controller[name].apply(_controller, args);
                }
                return null;
            };

            /**
             * Creates a new JW Player on your web page.
             * @param {object} options - The player configuration options.
             * @returns {Api}
             */
            this.setup = function(options) {
                this._qoe.tick('setup');

                resetPlayer(this, _controller);
                _controller = setupController(this, element);

                // bind event listeners passed in to the config
                utils.foreach(options.events, (evt, val) => {
                    // TODO: if 'evt' starts with 'on' convert to event name and register event with `on` method
                    const fn = this[evt];
                    if (typeof fn === 'function') {
                        fn.call(this, val);
                    }
                });

                options.id = this.id;
                _controller.setup(options, this);

                return this;
            };

            /** Remove the player from the page.
             * @returns {Api}
             */
            this.remove = function() {
                // Remove from array of players
                removePlayer(this);

                // terminate state
                this.trigger('remove');

                // Unbind listeners and destroy controller/model/...
                resetPlayer(this, _controller);

                return this;
            };

            // TODO: Prevent object properties from being added or reassigned
            // Object.seal(this);
        }

        /**
         * @return {string} The Player API version.
         */
        get version() {
            return version;
        }

        /**
         * Provide Events module access to plugins from the player instance.
         * @deprecated TODO: in version 8.0.0-0
         */
        get Events() {
            return Events;
        }

        /**
         * Provide plugins with access to utils from the player instance.
         * @deprecated TODO: in version 8.0.0-0
         */
        get utils() {
            return utils;
        }

        /**
         * Provide plugins with access to underscore from the player instance.
         * @deprecated TODO: in version 8.0.0-0
         */
        get _() {
            return _;
        }

        /**
         * Bind an event to a callback function.
         * @param {string} name - The event name. Passing "all" will bind the callback to all events fired.
         * @param {function} callback - The event callback.
         * @param {any} [context] - The context to apply to the callback function's invocation.
         * @return {Api}
         */
        on(name, callback, context) {
            return Events.on.call(this, name, callback, context);
        }

        /**
         * Bind an event to only be triggered a single time. After the first time the callback is invoked, it will be removed.
         * @param {string} name - The event name. Passing "all" will bind the callback to all events fired.
         * @param {function} callback - The event callback.
         * @param {any} [context] - The context to apply to the callback function's invocation.
         * @return {Api}
         */
        once(name, callback, context) {
            return Events.once.call(this, name, callback, context);
        }

        /**
         * Remove one or many callbacks.
         * @param {string} [name] - The event name. If null, removes all bound callbacks for all events.
         * @param {function} [callback] - If null, removes all callbacks for the event.
         * @param {any} [context] - If null, removes all callbacks with that function.
         * @return {Api}
         */
        off(name, callback, context) {
            return Events.off.call(this, name, callback, context);
        }

        /**
         * Trigger one or many events.
         * @param {string} name - The event name.
         * @param {object} [args] - An object containing the event properties.
         * @return {Api}
         */
        trigger(name, args) {
            if (_.isObject(args)) {
                args = _.extend({}, args);
            } else {
                args = {};
            }
            args.type = name;
            const jwplayer = window.jwplayer;
            if (jwplayer && jwplayer.debug) {
                return Events.trigger.call(this, name, args);
            }
            return Events.triggerSafe.call(this, name, args);
        }

        /**
         * @deprecated TODO: in version 8.0.0-0
         */
        triggerSafe(type, args) {
            return Events.triggerSafe.call(this, type, args);
        }

        /**
         * Get the QoE properties for the player.
         * @returns {{setupTime: number, firstFrame: number, player: object, item: object}}
         */
        qoe() {
            const qoeItem = this.callInternal('getItemQoe');

            const setupTime = this._qoe.between('setup', 'ready');
            const firstFrame = qoeItem.getFirstFrame();

            return {
                setupTime: setupTime,
                firstFrame: firstFrame,
                player: this._qoe.dump(),
                item: qoeItem.dump()
            };
        }

        /**
         * Get the list of available audio tracks.
         * @returns {Array}
         */
        getAudioTracks() {
            return this.callInternal('getAudioTracks');
        }

        /**
         * Get the percentage of the media's duration which has been buffered.
         * @returns {number} A number from 0-100 indicating the percentage of media buffered.
         */
        getBuffer() {
            return this.callInternal('get', 'buffer');
        }

        getCaptions() {
            return this.callInternal('get', 'captions');
        }

        getCaptionsList() {
            return this.callInternal('getCaptionsList');
        }

        getConfig() {
            return this.callInternal('getConfig');
        }

        getContainer() {
            return this.callInternal('getContainer');
        }

        getControls() {
            return this.callInternal('get', 'controls');
        }

        getCurrentAudioTrack() {
            return this.callInternal('getCurrentAudioTrack');
        }

        getCurrentCaptions() {
            return this.callInternal('getCurrentCaptions');
        }

        getCurrentQuality() {
            return this.callInternal('getCurrentQuality');
        }

        getDuration() {
            return this.callInternal('get', 'duration');
        }

        getFullscreen() {
            return this.callInternal('get', 'fullscreen');
        }

        getHeight() {
            return this.callInternal('getHeight');
        }

        /**
         * Alias of `getPlaylistIndex()`
         * @deprecated TODO: in version 8.0.0-0
         */
        getItem() {
            return this.getPlaylistIndex();
        }

        getItemMeta() {
            return this.callInternal('get', 'itemMeta') || {};
        }

        /**
         * Alias of `getItemMeta()`
         * @deprecated TODO: in version 8.0.0-0
         */
        getMeta() {
            return this.getItemMeta();
        }

        getMute() {
            return this.callInternal('getMute');
        }

        getPlaybackRate() {
            return this.callInternal('get', 'playbackRate');
        }

        getPlaylist() {
            return this.callInternal('get', 'playlist');
        }


        getPlaylistIndex() {
            return this.callInternal('get', 'item');
        }

        getPlaylistItem(index) {
            if (!utils.exists(index)) {
                return this.callInternal('get', 'playlistItem');
            }
            const playlist = this.getPlaylist();
            if (playlist) {
                return playlist[index];
            }
            return null;
        }

        getPosition() {
            return this.callInternal('get', 'position');
        }

        getProvider() {
            return this.callInternal('getProvider');
        }

        getQualityLevels() {
            return this.callInternal('getQualityLevels');
        }

        getSafeRegion() {
            return this.callInternal('getSafeRegion');
        }

        getState() {
            return this.callInternal('getState');
        }

        getStretching() {
            return this.callInternal('get', 'stretching');
        }

        getViewable() {
            return this.callInternal('get', 'viewable');
        }

        getVisualQuality() {
            return this.callInternal('getVisualQuality');
        }

        getVolume() {
            return this.callInternal('get', 'volume');
        }

        getWidth() {
            return this.callInternal('getWidth');
        }

        /**
         * Sets custom captions styles
         * @param {object} captionsStyles
         * @returns {Api}
         */
        setCaptions(captionsStyles) {
            this.callInternal('setCaptions', captionsStyles);
            return this;
        }

        /**
         * Update player config options
         * @param options
         * @returns {Api}
         */
        setConfig(options) {
            this.callInternal('setConfig', options);
            return this;
        }

        /**
         * Toggle player controls.
         * @param {boolean} [toggle] - Specifies whether controls should be enabled or disabled.
         * @returns {Api}
         */
        setControls(toggle) {
            this.callInternal('setControls', toggle);
            return this;
        }

        setCurrentAudioTrack(index) {
            return this.callInternal('setCurrentAudioTrack', index);
        }

        setCurrentCaptions(index) {
            return this.callInternal('setCurrentCaptions', index);
        }

        setCurrentQuality(index) {
            return this.callInternal('setCurrentQuality', index);
        }

        /**
         * Toggle fullscreen state. Most browsers require a user gesture to trigger entering fullscreen mode.
         * @param {boolean} [toggle] - Specifies whether to enter or exit fullscreen mode.
         * @returns {Api}
         */
        setFullscreen(toggle) {
            this.callInternal('setFullscreen', toggle);
            return this;
        }

        /**
         * Toggle the player mute state.
         * @param {boolean} [toggle] - Specifies whether to mute or unmute the player.
         * @returns {Api}
         */
        setMute(toggle) {
            this.callInternal('setMute', toggle);
            return this;
        }

        /**
         * Set the player default playerback rate. During playback, the rate of the current media will be set immediately if supported. Not supported when streaming live.
         * @param {number} playbackRate - The desired rate of playback. Limited to values between 0.25-4.0.
         * @returns {Api}
         */
        setPlaybackRate(playbackRate) {
            this.callInternal('setPlaybackRate', playbackRate);
            return this;
        }

        /**
         * Sets the list of cues to be displayed on the time slider.
         * @param {Array} sliderCues - A list of cues. Cue objects must contain a `begin` and `text` property.
         * @returns {Api}
         */
        setCues(sliderCues) {
            this.callInternal('setCues', sliderCues);
            return this;
        }

        /**
         * Set the player volume level.
         * @param {number} level - A value from 0-100.
         * @returns {Api}
         */
        setVolume(level) {
            this.callInternal('setVolume', level);
            return this;
        }

        load(toLoad, feedData) {
            this.callInternal('load', toLoad, feedData);
            return this;
        }

        play(state, meta) {
            if (_.isObject(state) && state.reason) {
                meta = state;
            }
            if (!meta) {
                meta = { reason: 'external' };
            }
            if (state === true) {
                this.callInternal('play', meta);
                return this;
            } else if (state === false) {
                this.callInternal('pause', meta);
                return this;
            }

            state = this.getState();
            switch (state) {
                case states.PLAYING:
                case states.BUFFERING:
                    this.callInternal('pause', meta);
                    break;
                default:
                    this.callInternal('play', meta);
            }

            return this;
        }

        seek(pos, meta = { reason: 'external' }) {
            this.callInternal('seek', pos, meta);
            return this;
        }

        playlistNext(meta = { reason: 'external' }) {
            this.callInternal('playlistNext', meta);
            return this;
        }

        playlistPrev(meta = { reason: 'external' }) {
            this.callInternal('playlistPrev', meta);
            return this;
        }

        playlistItem(index, meta = { reason: 'external' }) {
            this.callInternal('playlistItem', index, meta);
            return this;
        }

        castToggle() {
            this.callInternal('castToggle');
            return this;
        }

        createInstream() {
            return this.callInternal('createInstream');
        }

        skipAd() {
            this.callInternal('skipAd');
            return this;
        }

        stop() {
            this.callInternal('stop');
            return this;
        }

        resize(width, height) {
            this.callInternal('resize', width, height);
            return this;
        }

        addButton(img, tooltip, callback, id, btnClass) {
            this.callInternal('addButton', img, tooltip, callback, id, btnClass);
            return this;
        }

        removeButton(id) {
            this.callInternal('removeButton', id);
            return this;
        }

        /**
         * Resume normal playback after an ad break
         * @deprecated TODO: in version 8.0.0-0
         */
        attachMedia() {
            this.callInternal('attachMedia');
            return this;
        }

        /**
         * Detach player state from current playback media before an ad break
         * @deprecated TODO: in version 8.0.0-0
         */
        detachMedia() {
            this.callInternal('detachMedia');
            return this;
        }

        isBeforeComplete() {
            this.callInternal('isBeforeComplete');
            return this;
        }

        isBeforePlay() {
            this.callInternal('isBeforePlay');
            return this;
        }

        next() {
            this.callInternal('next');
            return this;
        }

        /**
         * Toggle or pause the playback state.
         * @param {boolean} [state] - An optional argument that indicate whether to pause (true) or play (false).
         * @param {object} [meta] - An optional argument used to specify cause.
         * @return {Api}
         */
        pause(state, meta) {
            // TODO: meta should no longer be accepted from the base API, it should be passed in to the controller by special wrapped interfaces
            if (_.isBoolean(state)) {
                return this.play(!state, meta);
            }

            return this.play(meta);
        }

        /**
         * Return the specified plugin instance.
         * @param {string} name - The name of the plugin.
         * @return {any} The plugin instance.
         */
        getPlugin(name) {
            return this.plugins && this.plugins[name];
        }

        /**
         * Add a plugin instance to the player instance.
         * @param {string} name - The name of the plugin.
         * @param {any} pluginInstance - The plugin instance.
         */
        addPlugin(name, pluginInstance) {
            this.plugins = this.plugins || {};
            this.plugins[name] = pluginInstance;

            this.on('ready', pluginInstance.addToPlayer);

            // A swf plugin may rely on resize events
            if (pluginInstance.resize) {
                this.on('resize'. pluginInstance.resizeHandler);
            }
        }

        /**
         * Register a plugin class with the library.
         * @param {string} name - The name of the plugin.
         * @param {string} minimumVersion - The minimum player version required by the plugin.
         * @param {function} constructor - The plugin function or class to instantiate with new player instances.
         * @param {function} [constructor2] - (TODO: Deprecated in 8.0.0) When passed in, the previous argument is a path to the flash plugin and this argument is the JS contructor.
         */
        registerPlugin(name, minimumVersion, constructor, constructor2) {
            plugins.registerPlugin(name, minimumVersion, constructor, constructor2);
        }

        /**
         * Check for the presence of an ad blocker. Implementation is done in jwplayer-commercial.
         * @returns {boolean} - Returns true when an ad blocker is detected, otherwise false.
         */
        getAdBlock() {
            return false;
        }

        /**
         * Play an ad. Implementation is done in ad plugin.
         * @param {string|Array} adBreak - The ad tag or waterfall array.
         */
        playAd(/* eslint-disable no-unused-vars */adBreak/* eslint-enable no-unused-vars */) {}

        /**
         * Play an ad. Implementation is done in ad plugin.
         * @param {boolean} toggle - Specifies whether ad playback should be paused or resumed.
         */
        pauseAd(/* eslint-disable no-unused-vars */toggle/* eslint-enable no-unused-vars */) {}

        /**
         * @deprecated since version 7.0. TODO: remove in 8.0.0-0
         */
        getRenderingMode() {
            return 'html5';
        }

        /**
         * @deprecated TODO: in version 8.0.0-0
         */
        dispatchEvent() {
            this.trigger.apply(this, arguments);
        }

        /**
         * @deprecated TODO: in version 8.0.0-0
         */
        removeEventListener() {
            this.off.apply(this, arguments);
        }

        /**
         * @deprecated TODO: in version 8.0.0-0
         */
        onBuffer(callback) {
            this.on('buffer', callback);
        }

        onPause(callback) {
            this.on('pause', callback);
        }

        onPlay(callback) {
            this.on('play', callback);
        }

        onIdle(callback) {
            this.on('idle', callback);
        }

        onBufferChange(callback) {
            this.on(events.JWPLAYER_MEDIA_BUFFER, callback);
        }

        onBufferFull(callback) {
            this.on(events.JWPLAYER_MEDIA_BUFFER_FULL, callback);
        }

        onError(callback) {
            this.on(events.JWPLAYER_ERROR, callback);
        }

        onSetupError(callback) {
            this.on(events.JWPLAYER_SETUP_ERROR, callback);
        }

        onFullscreen(callback) {
            this.on(events.JWPLAYER_FULLSCREEN, callback);
        }

        onMeta(callback) {
            this.on(events.JWPLAYER_MEDIA_META, callback);
        }

        onMute(callback) {
            this.on(events.JWPLAYER_MEDIA_MUTE, callback);
        }

        onPlaylist(callback) {
            this.on(events.JWPLAYER_PLAYLIST_LOADED, callback);
        }

        onPlaylistItem(callback) {
            this.on(events.JWPLAYER_PLAYLIST_ITEM, callback);
        }

        onPlaylistComplete(callback) {
            this.on(events.JWPLAYER_PLAYLIST_COMPLETE, callback);
        }

        onReady(callback) {
            this.on(events.JWPLAYER_READY, callback);
        }

        onResize(callback) {
            this.on(events.JWPLAYER_RESIZE, callback);
        }

        onComplete(callback) {
            this.on(events.JWPLAYER_MEDIA_COMPLETE, callback);
        }

        onSeek(callback) {
            this.on(events.JWPLAYER_MEDIA_SEEK, callback);
        }

        onTime(callback) {
            this.on(events.JWPLAYER_MEDIA_TIME, callback);
        }

        onVolume(callback) {
            this.on(events.JWPLAYER_MEDIA_VOLUME, callback);
        }

        onBeforePlay(callback) {
            this.on(events.JWPLAYER_MEDIA_BEFOREPLAY, callback);
        }

        onBeforeComplete(callback) {
            this.on(events.JWPLAYER_MEDIA_BEFORECOMPLETE, callback);
        }

        onDisplayClick(callback) {
            this.on(events.JWPLAYER_DISPLAY_CLICK, callback);
        }

        onControls(callback) {
            this.on(events.JWPLAYER_CONTROLS, callback);
        }

        onQualityLevels(callback) {
            this.on(events.JWPLAYER_MEDIA_LEVELS, callback);
        }

        onQualityChange(callback) {
            this.on(events.JWPLAYER_MEDIA_LEVEL_CHANGED, callback);
        }

        onCaptionsList(callback) {
            this.on(events.JWPLAYER_CAPTIONS_LIST, callback);
        }

        onCaptionsChange(callback) {
            this.on(events.JWPLAYER_CAPTIONS_CHANGED, callback);
        }

        onAdError(callback) {
            this.on(events.JWPLAYER_AD_ERROR, callback);
        }

        onAdClick(callback) {
            this.on(events.JWPLAYER_AD_CLICK, callback);
        }

        onAdImpression(callback) {
            this.on(events.JWPLAYER_AD_IMPRESSION, callback);
        }

        onAdTime(callback) {
            this.on(events.JWPLAYER_AD_TIME, callback);
        }

        onAdComplete(callback) {
            this.on(events.JWPLAYER_AD_COMPLETE, callback);
        }

        onAdCompanions(callback) {
            this.on(events.JWPLAYER_AD_COMPANIONS, callback);
        }

        onAdSkipped(callback) {
            this.on(events.JWPLAYER_AD_SKIPPED, callback);
        }

        onAdPlay(callback) {
            this.on(events.JWPLAYER_AD_PLAY, callback);
        }

        onAdPause(callback) {
            this.on(events.JWPLAYER_AD_PAUSE, callback);
        }

        onAdMeta(callback) {
            this.on(events.JWPLAYER_AD_META, callback);
        }

        onCast(callback) {
            this.on(events.JWPLAYER_CAST_SESSION, callback);
        }

        onAudioTrackChange(callback) {
            this.on(events.JWPLAYER_AUDIO_TRACK_CHANGED, callback);
        }

        onAudioTracks(callback) {
            this.on(events.JWPLAYER_AUDIO_TRACKS, callback);
        }
    };
});
