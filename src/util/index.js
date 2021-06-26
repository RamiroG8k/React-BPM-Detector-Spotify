export var SpotifyWebApi = (() => {
    let _baseUri = 'https://api.spotify.com/v1';
    let _baseTokenUri = 'https://spotify-web-api-token.herokuapp.com';
    let _accessToken = null;

    const _promiseProvider = (promiseFunction) => {
        return new window.Promise(promiseFunction);
    };

    const _checkParamsAndPerformRequest = (requestData, options, callback) => {
        let opt = {};
        let cb = null;

        if (typeof options === 'object') {
            opt = options;
            cb = callback;
        } else if (typeof options === 'function') {
            cb = options;
        }
        _extend(requestData.params, opt);
        return _performRequest(requestData, cb);
    };

    const _performRequest = (requestData, callback) => {
        const promiseFunction = (resolve, reject) => {
            const req = new XMLHttpRequest();
            const type = 'GET';
            req.open(type, _buildUrl(requestData.url, requestData.params), true);

            if (_accessToken) {
                req.setRequestHeader('Authorization', 'Bearer ' + _accessToken);
            }
            req.onreadystatechange = () => {
                if (req.readyState === 4) {
                    let data = null;
                    try {
                        data = req.responseText ? JSON.parse(req.responseText) : '';
                    } catch (e) { }

                    if (req.status === 200 || req.status === 201) {
                        if (resolve) {
                            resolve(data);
                        }
                        if (callback) {
                            callback(null, data);
                        }
                    } else {
                        if (reject) {
                            reject(req);
                        }
                        if (callback) {
                            callback(req, null);
                        }
                    }
                }
            };

            if (type === 'GET') {
                req.send(null);
            } else {
                req.send(JSON.stringify(requestData.postData));
            }
        };

        if (callback) {
            promiseFunction();
            return null;
        } else {
            return _promiseProvider(promiseFunction);
        }
    };

    const _extend = function () {
        let args = Array.prototype.slice.call(arguments);
        let target = args[0];
        let objects = args.slice(1);
        target = target || {};
        for (let i = 0; i < objects.length; i++) {
            for (let j in objects[i]) {
                target[j] = objects[i][j];
            }
        }
        return target;
    };

    const _buildUrl = (url, parameters) => {
        let qs = '';
        for (let key in parameters) {
            if (parameters.hasOwnProperty(key)) {
                let value = parameters[key];
                qs += encodeURIComponent(key) + '=' + encodeURIComponent(value) + '&';
            }
        }
        if (qs.length > 0) {
            qs = qs.substring(0, qs.length - 1); //chop off last '&'
            url = url + '?' + qs;
        }
        return url;
    };

    const Constr = function () { };

    Constr.prototype = {
        constructor: SpotifyWebApi
    };

    /**
     * Sets the access token to be used.
     * See [the Authorization Guide](https://developer.spotify.com/web-api/authorization-guide/) on
     * the Spotify Developer site for more information about obtaining an access token.
     * @param {string} accessToken The access token
     * @return {void}
     */
    Constr.prototype.setAccessToken = (accessToken) => _accessToken = accessToken;

    /**
     * Fetches tracks from the Spotify catalog according to a query.
     * See [Search for an Item](https://developer.spotify.com/web-api/search-item/) on
     * the Spotify Developer site for more information about the endpoint.
     * @param {Object} options A JSON object with options that can be passed
     * @param {function(Object, Object)} callback An optional callback that receives 2 parameters. The first
     * one is the error object (null if no error), and the second is the value if the request succeeded.
     * @return {Object} Null if a callback is provided, a `Promise` object otherwise
     */
    Constr.prototype.searchTracks = (query, options, callback) => {
        const requestData = {
            url: _baseUri + '/search/',
            params: {
                q: query,
                type: 'track'
            }
        };
        return _checkParamsAndPerformRequest(requestData, options, callback);
    };

    /**
     * Get audio features for a single track identified by its unique Spotify ID.
     * See [Get Audio Features for a Track](https://developer.spotify.com/web-api/get-audio-features/) on
     * the Spotify Developer site for more information about the endpoint.
     * @param {string} trackId The id of the track. If you know the Spotify URI it is easy
     * to find the track id (e.g. spotify:track:<here_is_the_track_id>)
     * @param {function(Object,Object)} callback An optional callback that receives 2 parameters. The first
     * one is the error object (null if no error), and the second is the value if the request succeeded.
     * @return {Object} Null if a callback is provided, a `Promise` object otherwise
     */
    Constr.prototype.getAudioFeaturesForTrack = (trackId, callback) => {
        const requestData = {
            url: _baseUri + '/audio-features/' + trackId
        };
        return _checkParamsAndPerformRequest(requestData, {}, callback);
    };

    /**
     * Obtains a token to be used against the Spotify Web API
     */
    Constr.prototype.getToken = (callback) => {
        const requestData = {
            url: _baseTokenUri + '/token'
        };
        return _checkParamsAndPerformRequest(requestData, {}, callback);
    };

    return Constr;
})();

export function getPeaks(data) {

    // What we're going to do here, is to divide up our audio into parts.

    // We will then identify, for each part, what the loudest sample is in that
    // part.

    // It's implied that that sample would represent the most likely 'beat'
    // within that part.

    // Each part is 0.5 seconds long - or 22,050 samples.

    // This will give us 60 'beats' - we will only take the loudest half of
    // those.

    // This will allow us to ignore breaks, and allow us to address tracks with
    // a BPM below 120.

    let partSize = 22050,
        parts = data[0].length / partSize,
        peaks = [];

    for (let i = 0; i < parts; i++) {
        let max = 0;
        for (let j = i * partSize; j < (i + 1) * partSize; j++) {
            let volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
            if (!max || (volume > max.volume)) {
                max = {
                    position: j,
                    volume: volume
                };
            }
        }
        peaks.push(max);
    }

    // Sort the peaks according to volume...
    peaks.sort(function (a, b) {
        return b.volume - a.volume;
    });

    // ...take the loundest half of those...
    peaks = peaks.splice(0, peaks.length * 0.5);

    // ...and re-sort it back based on position.
    peaks.sort(function (a, b) {
        return a.position - b.position;
    });

    return peaks;
}

export function getIntervals(peaks) {

    // What we now do is get all of our peaks, and then measure the distance to
    // other peaks, to create intervals.  Then based on the distance between
    // those peaks (the distance of the intervals) we can calculate the BPM of
    // that particular interval.

    // The interval that is seen the most should have the BPM that corresponds
    // to the track itself.

    let groups = [];

    peaks.forEach((peak, index) => {
        for (let i = 1; (index + i) < peaks.length && i < 10; i++) {
            let group = {
                tempo: (60 * 44100) / (peaks[index + i].position - peak.position),
                count: 1
            };

            while (group.tempo < 90) {
                group.tempo *= 2;
            }

            while (group.tempo > 180) {
                group.tempo /= 2;
            }

            group.tempo = Math.round(group.tempo);

            if (!(groups.some((interval) => (interval.tempo === group.tempo ? interval.count++ : 0)))) {
                groups.push(group);
            }
        }
    });
    return groups;
}