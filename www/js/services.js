angular.module('starter.services', [])

.factory('GameService', function($q, LogService, SpeakService) {
	/** Load object from local storage. */
	var loadObj = function(name, defaultValue) {
		var val = window.localStorage.getItem(name);
		if (val === null) return defaultValue;
		var obj = JSON.parse(val);
		return obj !== null ? obj : defaultValue;
	};
	/** Save object to local storage. */
	var saveObj = function(name, obj) {
		window.localStorage.setItem(name, JSON.stringify(obj));
	};
	/** Translates position class into a pure object that can be turned into JSON. */
	var positionToObj = function(position) {
		return {
			coords: {
				accuracy: position.coords.accuracy,
				altitude: position.coords.altitude,
				altitudeAccuracy: position.coords.altitudeAccuracy,
				heading: position.coords.heading,
				latitude: position.coords.latitude,
				longitude: position.coords.longitude,
				speed: position.coords.speed,
			},
			timestamp: position.timestamp,
		};
	}

	var self = {
		_no_game: true,
		_watch: null,

		_player_position: null,
		_demand_sequence: [],
		_world_shapes: [],

		_callbacks: null,
		_event_queue: [],

		// player moved status
		S_MOVED: 'moved',
		S_COLLECTED: 'collected',
		S_WRONG_SHAPE: 'wrong shape',
		S_NEW_GAME: 'new game',


		load: function() {
			self._demand_sequence = loadObj('demand_sequence', []);
			self._world_shapes = loadObj('world_shapes', []);

			return self._demand_sequence.length !== 0 && self._world_shapes.length !== 0;
		},
		save: function() {
			saveObj('demand_sequence', self._demand_sequence);
			saveObj('world_shapes', self._world_shapes);
		},

		continueOrNewGame: function() {
			LogService.writeLn('GameService: continue or new game');
			self._demand_sequence = [];
			self._world_shapes = [];

			if (self.load()) {
				self._no_game = false;

				self.pushEvent('game_loaded');
				self.callEvents();

				var dfd = $q.defer();
				dfd.resolve();
				return dfd.promise;
			} else {
				return self.newGame();
			}
		},

		newGame: function(difficulty) {
			var dfd = $q.defer();

			// Reset game state
			self._initial_position = null;
			self._player_position = null;
			self._demand_sequence = [];
			self._world_shapes = [];

			if (self._new_game_callback !== null) {
				self.pushEvent('new_game', ['clean']);
				self.callEvents();
			}

			// Get current location
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition(function(position) {
					self._initial_position = positionToObj(position);
					self._player_position = positionToObj(position);
					self.generateWorld(difficulty);
					self.save();
					self._no_game = false;

					self.pushEvent('new_game', ['done']);
					self.pushEvent('player_moved', [self._initial_position, self.S_NEW_GAME]);
					self.callEvents();

					dfd.resolve();
				}, function() {
					self.pushEvent('new_game', ['failed']);
					self.callEvents();
					dfd.reject();
				}, self.getLocationOptions());
			} else {
				self.pushEvent('new_game', ['failed']);
				self.callEvents();
				dfd.reject();
			}

			return dfd.promise;
		},

		generateWorld: function(difficulty) {
			LogService.writeLn('Generate world. Difficulty: ' + difficulty);
			var initial_pos = turf.point([self._initial_position.coords.longitude, self._initial_position.coords.latitude]);

			self._demand_sequence = [];
			var shapes = [];
			if (difficulty === 'original') {
				shapes = ['square', 'circle', 'cross', 'triangle', 'ring'];

				for (var i = 0; i < 7; i++) {
					self._demand_sequence.push({
						i: i,
						type: shapes[Math.floor(Math.random() * shapes.length)],
					});
				}

				for (var i = 0; i < 25; i++) {
					// Balance type availability to what is demanded
					var shape_type = self._demand_sequence[i % self._demand_sequence.length].type;

					var distance_km = 0.1 + Math.random() * 0.5;
					var angle = -180 + Math.random() * 360;
					var pos = turf.destination(initial_pos, distance_km, angle, 'kilometers');
					var latitude = pos.geometry.coordinates[1];
					var longitude = pos.geometry.coordinates[0];
					//LogService.writeLn(shape_type + ' at ' + latitude + ',' + longitude);

					self._world_shapes.push({
						type: shape_type,
						coords: {
							latitude: latitude,
							longitude: longitude,
						},
					});
				}
			} else if (difficulty === 'easy') {
				shapes = ['square', 'circle', 'triangle'];

				// Demand sequence
				for (var i = 0; i < 3; i++) {
					self._demand_sequence.push({
						i: i,
						type: shapes[i],
					});
				}

				// Add shapes to collect
				for (var i_range = 0; i_range < 4; i_range++) {
					for (var i_angle = 0; i_angle < 6; i_angle++) {
						var shape_type = self._demand_sequence[i_angle % self._demand_sequence.length].type;

						var distance_km = 0.1 * (i_range + 1);
						var angle = -180 + (i_angle + i_range) % 6 / 6.0 * 360;
						var pos = turf.destination(initial_pos, distance_km, angle, 'kilometers');
						var latitude = pos.geometry.coordinates[1];
						var longitude = pos.geometry.coordinates[0];

						self._world_shapes.push({
							type: shape_type,
							coords: {
								latitude: latitude,
								longitude: longitude,
							},
						});
					}
				}
			} else {
				throw "Unexpected difficulty";
			}

		},

		/** Push event to event queue. */
		pushEvent: function(callback_name, params) {
			self._event_queue.push({name: callback_name, params: params});
			LogService.writeLn('event: ' + callback_name);
		},

		/** Call all event handlers in queue. */
		callEvents: function() {
			if (self._callbacks === null) return;
			while (self._event_queue.length > 0) {
				var e = self._event_queue[0];
				self._event_queue.splice(0, 1);

				var cb = self._callbacks[e.name];
				cb.fn.apply(cb.self, e.params);
			}
		},

		/** Initializes callbacks and geolocation service */
		setupCallbacks: function(callbacks) {
			LogService.writeLn('GameService: set callbacks');
			self._callbacks = callbacks;
		},

		startWatch: function() {
			LogService.writeLn('Start watch position');
			self._watch = navigator.geolocation.watchPosition(self.watchCallback, function() {
				LogService.writeLn('Watch position failed');
			}, self.getLocationOptions());
		},
		stopWatch: function() {
			LogService.writeLn('Stop watch position');
			navigator.geolocation.clearWatch(self._watch);
			self._watch = null;
		},

		getLocationOptions: function() {
			return {
				enableHighAccuracy: true,
				maximumAge: 10*1000, // ms
				timeout: 15*1000, // ms
			};
		},

		watchCallback: function(position) {
			if (self._no_game) {
				LogService.writeLn('game not started yet');
				return;
			}

			self._player_position = positionToObj(position);
			self.playerMoved();
		},
		playerMoved: function() {
			var player_point = turf.point([self._player_position.coords.longitude, self._player_position.coords.latitude]);

			var closest_shape = null;
			var closest_shape_index = null;
			var nearby_any_type = null;
			var demand_shape = self.getNextDemandedShapeType();
			for (var i = 0; i < self._world_shapes.length; i++) {
				var shape = self._world_shapes[i];
				shape.distance_km = turf.distance(
						turf.point([shape.coords.longitude, shape.coords.latitude]),
						player_point,
						'kilometers');

				if (self.isWorldShapeNearby(shape)) {
					nearby_any_type = true;
					if (shape.type === demand_shape &&
							(closest_shape === null || shape.distance_km < closest_shape.distance_km)) {
						closest_shape = shape;
						closest_shape_index = i;
					}
				}
			}

			if (closest_shape !== null) {
				// Found a nearby shape of correct type
				self._demand_sequence.splice(0, 1); // remove first demand
				self._world_shapes.splice(closest_shape_index, 1); // remove world shape

				// Shift shapes
				var type_list = [];
				for (var i = 0; i < self._world_shapes.length; i++) {
					type_list.push(self._world_shapes[i].type);
				}
				for (var i = 0; i < self._world_shapes.length; i++) {
					var random_index = Math.floor(Math.random() * type_list.length);
					var shape_type = type_list[random_index];
					type_list.splice(random_index, 1);
					self._world_shapes[i].type = shape_type;
				}
			}

			var status = self.S_MOVED;
			if (closest_shape !== null) {
				status = self.S_COLLECTED;
			} else if (nearby_any_type) {
				status = self.S_WRONG_SHAPE;
			}

			self.pushEvent('player_moved', [self._player_position, status, closest_shape]);
			self.callEvents();
			if (closest_shape === null && !nearby_any_type) {
				SpeakService.say('not yet there', 60); // announce positions when there is not something else to say.
			}
		},

		isWorldShapeNearby: function(shapeObj) {
			return shapeObj.distance_km < 0.070;
		},

		getNextDemandedShapeType: function() {
			return self._demand_sequence.length > 0 ? self._demand_sequence[0].type : null;
		},
	};
	return self;
})

.factory('SpeakService', function($q, LogService, MusicService) {

	var self = {
		has_init: false,

		is_speaking: false,
		last_end: null,

		has_tts: null,
		has_web_api: null,
		voice: null,
		mute: null,

		init: function() {
			self.has_init = true;
			var loaded_mute = window.localStorage.getItem('mute');
			self.mute = loaded_mute !== null ? loaded_mute === true || loaded_mute === "true" : false;

			self.has_tts = window.cordova !== undefined;
			self.has_web_api = window.speechSynthesis !== undefined;

			var apis = [];
			if (self.has_tts) apis.push('TTS');
			if (self.has_web_api) apis.push('Web Speech API');
			LogService.writeLn('Available speech APIs: ' + apis.join(', '));

			if (!self.has_tts && !self.has_web_api) {
				// NO api => mute
				self.mute = true;
			}
		},

		getWebApiVoice: function() {
			// Pick a voice
			if (self.voice !== null) return self.voice;

			var voice_list = window.speechSynthesis.getVoices();
			if (voice_list !== null) {
				for (var i = 0; i < voice_list.length; i++) {
					if (voice_list[i].default) {
						self.voice = voice_list[i];
						break;
					}
				}
				if (self.voice === null && voice_list.length > 0) {
					self.voice = voice_list[0];
				}
			}

			return self.voice;
		},

		/**
		 * Say a message
		 * @param minSilenceTimeS only say the message if we have been silent for this amount of time
		 */
		say: function(text, minSilenceTimeS) {
			if (!self.has_init) self.init();

			if (!self.canSpeakNow(minSilenceTimeS)) return;

			LogService.writeLn('SpeakService: say');
			MusicService.mute(true);

			if (self.has_tts) {
				self.is_speaking = true;
				TTS.speak({
					text: text,
					locale: 'en-GB',
					rate: 0.75,
				}, function() {
					// done
					self.last_end = (new Date()).getTime();
					self.is_speaking = false;
					MusicService.mute(false);
				}, function(reason) {
					// failed
					
					// fall back to Web API if available
					self.has_tts = false;
					self.is_speaking = false;
					MusicService.mute(false);
					self.say(text);
				});
			} else if(self.has_web_api) {
				self.is_speaking = true;
				var utterThis = new SpeechSynthesisUtterance(text);
				var voice = self.getWebApiVoice();
				//if (voice !== null) utterThis.voice = voice;
				utterThis.lang = 'en-GB';
				utterThis.pitch = 1.2;
				utterThis.rate = 0.3;
				utterThis.onend = function() {
					LogService.writeLn('speak .onend');
					self.last_end = (new Date()).getTime();
					self.is_speaking = false;
					MusicService.mute(false);
				};
				utterThis.onerror = function() {
					LogService.writeLn('speak .onerror');
					self.is_speaking = false;
					MusicService.mute(false);
				};
				window.speechSynthesis.speak(utterThis);
			} else {
				LogService.writeLn('SpeakService: There is no Text-to-speach API available');
				MusicService.mute(false);
			}
		},

		canSpeak: function() {
			if (!self.has_init) self.init();

			return self.has_tts || self.has_web_api;
		},

		canSpeakNow: function(minSilenceTimeS) {
			if (!self.has_init) self.init();

			if (!self.has_tts && !self.has_web_api) return false;

			if (self.mute) {
				LogService.writeLn('SpeakService: voice muted');
				return false;
			}

			if (minSilenceTimeS === undefined) minSilenceTimeS = null;
			if (minSilenceTimeS !== null && self.is_speaking) {
				LogService.writeLn('Skip voicing message due to speaking and minSilenceTimeS being set');
				return false;
			}
			if (self.last_end !== null && (new Date()).getTime() - self.last_end < minSilenceTimeS * 1000) {
				LogService.writeLn('Skip voicing message due to minSilenceTimeS limit');
				return false;
			}

			return true;
		},

		getMute: function() {
			if (!self.has_init) self.init();

			return self.mute;
		},

		setMute: function(value) {
			if (!self.has_init) init();

			self.mute = value;
			window.localStorage.setItem('mute', value);
		},
	};
	return self;
})

.factory('MusicService', function($q, LogService) {
	var self = {
		music: null,
		music_muted: false,

		init: function() {
			self.music = document.getElementById('music');
			self.music.volume = 0.6;
			self.music.play();
		},
		mute: function(value) {
			if (value) {
				LogService.writeLn('MusicService: mute');
				// Play/pause too quick cause an exception to be thrown. Minimal volume does seem to work
				// more stable.
				self.music.volume = 0.01;
			} else {
				LogService.writeLn('MusicService: unmute');
				self.music.volume = 0.6;
				self.music.play();
			}
		},
	};
	self.init();
	return self;
})

.factory('LogService', function($q) {
	var self = {
		logLines: [],
		limit: 100,

		writeLn: function(text) {
			self.logLines.push({id: self.logLines.length, text: text});
			if (self.logLines.length > self.limit) self.logLines.splice(0, self.logLines.length - self.limit);
			console.log(text);
		},
		getLines: function() {
			return self.logLines;
		},
	};
	return self;
})

;
