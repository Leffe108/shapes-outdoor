angular.module('starter.controllers', [])

.controller('StartCtrl', function($scope, $state) {
	$scope.start = function() {
		$state.go('app.game');
	};
})

.controller('AppCtrl', function($scope, $state, GameService, SpeakService) {

	$scope.mute = SpeakService.getMute();

	$scope.newGame = function() {
		GameService.newGame().then(function() {
			$state.go('app.game');
		}, function() {
			alert('New game failed');
		});
	};

	$scope.restartWatchPosition = function() {
		GameService.stopWatch();
		GameService.startWatch();
	};

	$scope.toggleMute = function() {
		if (SpeakService.getMute() && !SpeakService.canSpeak()) {
			alert("Your browser doesn't support Web Speech API. Try in Chrome or download game for Android.")
		} else {
			SpeakService.setMute(!SpeakService.getMute());
			$scope.mute = SpeakService.getMute();
		}
	};
})

.controller('GameCtrl', function($scope, $timeout, GameService, SpeakService, LogService) {

	$scope.message = '';

	$scope.player_position = null;
	$scope.demand_sequence = null;
	$scope.world_shapes = null;

	$scope.map = null;
	$scope.player_marker = null;
	$scope.shape_markers = [];
	$scope.player_icons = {};

	$scope.no_signal_timeout = null;

	$scope.playerMovedDebug = function() {
		GameService.playerMoved();
	};

	var initMap = function() {
		$scope.map = L.map('map', {
			zoomControl: false, // semi-broken for some reason.
			attributionControl: false, // Attributed in about dialog instead.
		}).setZoom(16);

		$scope.player_icons.default = L.icon({
						iconUrl: 'img/player.png',
						iconRetinaUrl: 'img/player@2x.png',
						iconSize: [32,32],
						iconAnchor: [16,16],
					});
		$scope.player_icons.no_signal = L.icon({
						iconUrl: 'img/player-no-signal.png',
						iconRetinaUrl: 'img/player-no-signal@2x.png',
						iconSize: [32,32],
						iconAnchor: [16,16],
					});
	};

	var setMessage = function(text, minSilenceTimeS) {
		LogService.writeLn('message: ' + text);
		$scope.message = text;
		SpeakService.say(text, minSilenceTimeS);
	};

	var playerMovedCB = {
		$scope: $scope,
		on: function(position, status, collected_shape) {
			LogService.writeLn('player moved');
			//setMessage('You moved');
			$scope.player_position = position;

			var player_latlng = L.latLng({'lng': position.coords.longitude, 'lat': position.coords.latitude});
			if ($scope.player_marker === null) {
				$scope.player_marker = L.rotatedMarker(player_latlng, {
					icon: $scope.player_icons.default,
					clickable: false,
					keyboard: false,
					});
				$scope.player_marker.options.angle = position.coords.heading;
				$scope.player_marker.addTo($scope.map);
				$scope.map.setView(player_latlng);
			} else {
				if (position.coords.heading !== null) { // don't reset heading when unknown
					$scope.player_marker.options.angle = position.coords.heading;
				}
				$scope.player_marker.setLatLng(player_latlng);
				$scope.player_marker.setIcon($scope.player_icons.default);
				$scope.map.setView(player_latlng);
			}

			// Switch to no signal icon after some timeout unless a new position is received
			if ($scope.no_signal_timeout !== null) {
				$timeout.cancel($scope.no_signal_timeout);
			}
			$scope.no_signal_timeout = $timeout(function() {
				$scope.player_marker.setIcon($scope.player_icons.no_signal);
			}, 5000);

			if (status === GameService.S_COLLECTED) {
				LogService.writeLn('shape collected');
				announceNext('Collected a ' + collected_shape.type + '. ');
				updateShapeMarkers();
			} else if (status === GameService.S_WRONG_SHAPE) {
				LogService.writeLn('nearby wrong shape');
				if (GameService.getNextDemandedShapeType() !== null) {
					setMessage('Wrong shape. You look for a ' + GameService.getNextDemandedShapeType() + '.', 15);
				}
			} else if (status === GameService.S_MOVED) {
				if (SpeakService.canSpeakNow(60)) announceNext('Not yet there. ', '');
			}
			

			$scope.$apply();
		},
	};
	var gameLoadedCB = {
		$scope: $scope,
		on: function() {
			LogService.writeLn('game loaded');
			$scope.message = '';
			$scope.demand_sequence = GameService._demand_sequence;
			$scope.world_shapes = GameService._world_shapes;

			if ($scope.map === null) initMap();
			updateShapeMarkers();
			announceNext();
		},
	};
	var newGameCB = {
		$scope: $scope,
		on: function(state) {
			LogService.writeLn('new game, state: ' + state);
			$scope.message = '';
			$scope.demand_sequence = GameService._demand_sequence;
			$scope.world_shapes = GameService._world_shapes;

			if (state === 'done') {
				announceNext();
			}
			updateShapeMarkers();
		},
	};

	/** 
	 * Announce next shape to collect.
	 * @param repeat
	 */
	var announceNext = function(preNext, preWin) {
		if (preNext === undefined) preNext = '';
		if (preWin === undefined) preWin = '';
		var next = GameService.getNextDemandedShapeType();
		if (next !== null) {
			setMessage(preNext + 'Walk to a ' + next);
		} else {
			setMessage(preWin + 'Great you completed all');
		}
	};

	var updateShapeMarkers = function() {
		LogService.writeLn('update shape markers');
		// For now just rebuild all shape markers
		for (var i = 0; i < $scope.shape_markers.length; i++) {
			$scope.map.removeLayer($scope.shape_markers[i]);
		}
		$scope.shape_markers = [];

		for (var i = 0; i < $scope.world_shapes.length; i++) {
			var shape = $scope.world_shapes[i];
			var latlng = L.latLng({'lng': shape.coords.longitude, 'lat': shape.coords.latitude});
			var marker = L.rotatedMarker(latlng, {
				icon: L.icon({
					iconUrl: 'img/'+shape.type+'.png',
					iconRetinaUrl: 'img/'+shape.type+'@2x.png',
					iconSize: [32,32],
					iconAnchor: [16,16],
				}),
				clickable: false,
				keyboard: false,
				});
			marker.options.angle = Math.random() * 360;
			marker.addTo($scope.map);
			$scope.shape_markers.push(marker);
		}
	};

	$scope.$on('$ionicView.loaded', function() {

		GameService.setupCallbacks({
			player_moved: {self: playerMovedCB, fn: playerMovedCB.on},
			game_loaded: {self: gameLoadedCB, fn: gameLoadedCB.on},
			new_game: {self: newGameCB, fn: newGameCB.on},
		});

		GameService.startWatch();
	});

	$scope.$on('$ionicView.beforeEnter', function() {
		if ($scope.map === null) initMap();
	});
	$scope.$on('$ionicView.beforeLeave', function() {
	});
})

.controller('AboutCtrl', function($scope, LogService) {
	$scope.device = false;
	$scope.debug = '';
	$scope.voice = null;

	$scope.$on('$ionicView.loaded', function() {
		$scope.device = window.cordova !== undefined;
	});
	$scope.$on('$ionicView.beforeEnter', function() {
		var text = 'About the game';
		var utterThis = new SpeechSynthesisUtterance(text);
		utterThis.pitch = 1.2;
		utterThis.rate = 0.3;
		window.speechSynthesis.speak(utterThis);
	});
})

.controller('LogCtrl', function($scope, LogService, SpeakService) {
	$scope.log = [];

	$scope.refresh = function() {
		$scope.log = LogService.getLines().reverse();
	};

	$scope.$on('$ionicView.beforeEnter', function() {
		$scope.refresh();

		SpeakService.say('Logs');
	});
})
;
