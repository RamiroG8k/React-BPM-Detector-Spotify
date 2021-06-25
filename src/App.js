import { useState, useRef } from 'react';
import { SpotifyWebApi, getIntervals, getPeaks } from './util';

const App = () => {
    const [track, setTrack] = useState('');
    const [result, setResult] = useState({});
    const audio = useRef();
    const spotifyApi = new SpotifyWebApi();

    spotifyApi.getToken().then(function (response) {
        spotifyApi.setAccessToken(response.token);
    });

    const handleSubmit = (event) => {
        event.preventDefault();

        spotifyApi.searchTracks(event.target.song.value.trim(), { limit: 1 })
            .then((response) => {
                const track = response.tracks.items[0];
                const previewUrl = track.preview_url;
                setTrack(track.preview_url);
                var request = new XMLHttpRequest();
                request.open('GET', previewUrl, true);
                request.responseType = 'arraybuffer';
                request.onload = function () {

                    // Create offline context
                    var OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                    var offlineContext = new OfflineContext(2, 30 * 44100, 44100);

                    offlineContext.decodeAudioData(request.response, function (buffer) {

                        // Create buffer source
                        var source = offlineContext.createBufferSource();
                        source.buffer = buffer;

                        // Beats, or kicks, generally occur around the 100 to 150 hz range.
                        // Below this is often the bassline.  So let's focus just on that.

                        // First a lowpass to remove most of the song.

                        var lowpass = offlineContext.createBiquadFilter();
                        lowpass.type = "lowpass";
                        lowpass.frequency.value = 150;
                        lowpass.Q.value = 1;

                        // Run the output of the source through the low pass.

                        source.connect(lowpass);

                        // Now a highpass to remove the bassline.

                        var highpass = offlineContext.createBiquadFilter();
                        highpass.type = "highpass";
                        highpass.frequency.value = 100;
                        highpass.Q.value = 1;

                        // Run the output of the lowpass through the highpass.

                        lowpass.connect(highpass);

                        // Run the output of the highpass through our offline context.

                        highpass.connect(offlineContext.destination);

                        // Start the source, and render the output into the offline conext.

                        source.start(0);
                        offlineContext.startRendering();
                    });

                    offlineContext.oncomplete = function (e) {
                        var buffer = e.renderedBuffer;
                        var peaks = getPeaks([buffer.getChannelData(0), buffer.getChannelData(1)]);
                        var groups = getIntervals(peaks);

                        var svg = document.querySelector('#svg');
                        svg.innerHTML = '';
                        var svgNS = 'http://www.w3.org/2000/svg';
                        var rect;
                        peaks.forEach(function (peak) {
                            rect = document.createElementNS(svgNS, 'rect');
                            rect.setAttributeNS(null, 'x', (100 * peak.position / buffer.length) + '%');
                            rect.setAttributeNS(null, 'y', 0);
                            rect.setAttributeNS(null, 'width', 1);
                            rect.setAttributeNS(null, 'height', '100%');
                            svg.appendChild(rect);
                        });

                        rect = document.createElementNS(svgNS, 'rect');
                        rect.setAttributeNS(null, 'id', 'progress');
                        rect.setAttributeNS(null, 'y', 0);
                        rect.setAttributeNS(null, 'width', 1);
                        rect.setAttributeNS(null, 'height', '100%');
                        svg.appendChild(rect);

                        svg.innerHTML = svg.innerHTML; // force repaint in some browsers

                        var top = groups.sort(function (intA, intB) {
                            return intB.count - intA.count;
                        }).splice(0, 5);

                        spotifyApi.getAudioFeaturesForTrack(track.id)
                            .then((audioFeatures) => {
                                setResult({ track, top, tempo: audioFeatures.tempo });
                            });
                    };
                };
                request.send();
            });

    }

    function updateProgressState() {
        if (audio.paused) {
            return;
        }
        var progressIndicator = document.querySelector('#progress');
        if (progressIndicator && audio.duration) {
            progressIndicator.setAttribute('x', (audio.currentTime * 100 / audio.duration) + '%');
        }
        requestAnimationFrame(updateProgressState);
    }

    const HandleResult = () => {
        return (
            <>
                <div className="text-lg sm:text-xl">
                    <div>Guess for track <strong>{result.track.name}</strong> by <strong>{result.track.artists[0].name}</strong> is <strong>
                        {Math.round(result.top[0].tempo)} BPM</strong> with {result.top[0].count} samples.</div>

                    <div class="small">Other options are [
                        {result.top.slice(1).map((e) => {
                            return e.tempo + ' BPM (' + e.count + ')';
                        }).join(', ')}]
                    </div>
                </div>

                <div class="small">The tempo according to Spotify is {result.tempo} BPM</div>
            </>
        );
    }

    // audio.addEventListener('playing', updateProgressState);
    
    const handlePlay = () => {
        audio.play();

        // audio.paused ? audio.play() : audio.pause();
        // if (audio.paused) {
        //     audio.play();
        // } else {
        //     audio.pause();
        // }
        updateProgressState();
    };

    return (
        <section className="p-10 sm:py-10 sm:px-36 h-screen w-screen bg-gray-700 justify-center items-center">
            <div className="text-center sm:my-10">
                <h1 className="text-4xl sm:text-5xl font-bold text-gray-400 my-3">Finding out the BPM of a song using Javascript</h1>
                <p className="text-lg leading-tight sm:text-2xl text-gray-900 font-semibold">This demo uses the browser's <strong>Audio API</strong> to determine the tempo of a song, processing a chunk of
                    30 seconds of a song.</p>
            </div>

            <form onSubmit={handleSubmit} className="sm:flex my-5 sm:my-10 gap-5">
                <div className="w-full">
                    <input className="block w-full p-3 rounded-t-2xl focus:outline-none text-center" name="song"
                        placeholder="Type the name of a track (e.g. Beyonce - Baby Boy)" />
                    <button className="block w-full bg-gray-400 p-3 rounded-b-2xl focus:outline-none" type="submit">
                        Search track &amp; Calculate tempo
                    </button>
                </div>
                <div className="flex my-2 sm:m-0 sm:w-2/12 justify-center items-center">
                    {track && <button OnClick={() => handlePlay()} 
                    className={track ? "block" : "hidden", "flex-1 h-full bg-gray-600 p-2 rounded-2xl focus:outline-none"}>{audio.paused ? 'Play track' : 'Pause track'}</button>}
                </div>
            </form>

            <div>
                <div className="text-center text-gray-900 font-semibold">
                    {result.track && <HandleResult />}
                </div>
                {track && <svg className="w-full bg-gray-500 h-16 my-4" id="svg"></svg>}
                <audio ref={audio} src={track}></audio>
            </div>
        </section>
    );
}

export default App;
