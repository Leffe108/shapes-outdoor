// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('starter', ['ionic', 'starter.controllers', 'starter.services'])

.run(function($ionicPlatform, $timeout, GameService) {
	$ionicPlatform.ready(function() {
		// Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
		// for form inputs)
		if (window.cordova && window.cordova.plugins.Keyboard) {
			cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
			cordova.plugins.Keyboard.disableScroll(true);

		}
		if (window.StatusBar) {
			// org.apache.cordova.statusbar required
			StatusBar.styleDefault();
		}

		GameService.continueOrNewGame();

		// MIT-licensed code by Benjamin Becquet
		// https://github.com/bbecquet/Leaflet.PolylineDecorator
		L.RotatedMarker = L.Marker.extend({
			options: { angle: 0 },
			_setPos: function(pos) {
				L.Marker.prototype._setPos.call(this, pos);
				if (L.DomUtil.TRANSFORM) {
					// use the CSS transform rule if available
					this._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + this.options.angle + 'deg)';
				} else if (L.Browser.ie) {
					// fallback for IE6, IE7, IE8
					var rad = this.options.angle * L.LatLng.DEG_TO_RAD,
					costheta = Math.cos(rad),
					sintheta = Math.sin(rad);
					this._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
						costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
				}
			}
		});
		L.rotatedMarker = function(pos, options) {
			return new L.RotatedMarker(pos, options);
		};
		// End of code by Benjamin Becquet

	});
})

.config(function($stateProvider, $urlRouterProvider) {
	$stateProvider

	.state('start', {
		url: '/start',
		templateUrl: 'templates/start.html',
		controller: 'StartCtrl'
	})

	.state('app', {
		url: '/app',
		abstract: true,
		templateUrl: 'templates/menu.html',
		controller: 'AppCtrl'
	})

	.state('app.game', {
		url: '/game',
		views: {
			'menuContent': {
				templateUrl: 'templates/game.html',
				controller: 'GameCtrl'
			}
		}
	})

	.state('app.about', {
		url: '/about',
		views: {
			'menuContent': {
				templateUrl: 'templates/about.html',
				controller: 'AboutCtrl'
			}
		}
	})

	.state('app.log', {
		url: '/log',
		views: {
			'menuContent': {
				templateUrl: 'templates/log.html',
				controller: 'LogCtrl'
			}
		}
	})

	// if none of the above states are matched, use this as the fallback
	$urlRouterProvider.otherwise('/start');
});
