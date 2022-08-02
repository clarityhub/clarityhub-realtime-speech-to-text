const WebSocket = require('ws');
const speech = require('@google-cloud/speech');
const uuid = require('uuid/v4');
const rp = require('request-promise');

const client = new speech.SpeechClient();

const API_BASE = 'http://core:4000';

const services = {
    api: { 
        async appendToInterview(interviewId, payload, { token }) {
            return rp({
                uri: `${API_BASE}/interviews/${interviewId}/actions/append`,
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${token}`,
                },
                'content-type': 'application/json',
                body: JSON.stringify(payload),
            });
        }
    }
}

async function handleAuth(payload, socket) {
    const { accessToken } = payload;
    
    // TODO check accessToken and pull out claims
    socket.token = accessToken;
    socket.user = {
        userId: '1234',
        email: 'idmontie@gmail.com',
        currentWorkspaceId: '1234',
        role: 'member',
    };
};

async function handleSpeakStart(payload, socket) {
    const {
        locale = 'en-US',
        sampleRate = 44100,
        interviewId,
    } = payload;

    const request = {
        config: {
            encoding: 'LINEAR16',
            sampleRateHertz: sampleRate,
            languageCode: locale,
            enableSpeakerDiarization: true,
            diarizationSpeakerCount: 2,
        },
        interimResults: true,
    };

    socket.speechCallback = async function speechCallback(data) {
        // XXX debounce this section. We don't want to be too chatty with the front end
        if (data.results && data.results[0]) {
            const result = data.results[0];

            const {
                alternatives,
                isFinal,
                resultEndTime,
            } = result;

            console.log(result);

            if (!socket.groupingId) {
                socket.groupingId = uuid();
            }

            let utterance;

            if (!isFinal) {
                // Overwrite the last utternance
                utterance = {
                    id: socket.groupingId,
                    timestamp: +new Date(),
                    transcript: alternatives[0].transcript,
                    speakers: alternatives[0].words,
                    isFinal: false,
                };
            } else {
                // Finalize the utterance
                utterance = {
                    id: socket.groupingId,
                    timestamp: +new Date(),
                    transcript: alternatives[0].transcript,
                    speakers: alternatives[0].words,
                    isFinal: true,
                };

                // Start a new grouping
                socket.groupingId = uuid();

                // Send to Core
                await services.api.appendToInterview(
                    interviewId,
                    utterance,
                    {
                        token: socket.token,
                    }
                );
            }

            // socket.send(JSON.stringify({
            //     type: 'speak.transcript',
            //     payload: utterance,
            // }));
        } else {
            console.log('Reached transcription time limit');
            // TODO We need to manually restart the connection
        }
    };

    socket.errorCallback = function (data) {
        console.error(data);

        socket.send(JSON.stringify({
            type: 'error',
            payload: `Socket closed due to inactivity.`
        }));

        handleSpeakStop(null, socket);

        socket.close();
    };

    const recognizeStream = client
        .streamingRecognize(request)
        .on('error', socket.errorCallback)
        .on('data', socket.speechCallback);
    
    socket.stream = recognizeStream;
}

async function handleSpeakData(data, socket) {
    if (socket.stream) {
        socket.stream.write(data);
    }
}

async function handleSpeakStop(payload, socket) {
    if (socket.stream) {
        socket.stream.removeListener('error', socket.errorCallback);
        socket.stream.removeListener('data', socket.speechCallback);
        socket.stream.end();
        socket.stream = null;
    }
}

function startSocket(server) {
    const wss = new WebSocket.Server(server);

    wss.on('connection', function (socket) {
        socket.on('message', function incoming(raw) {
            let type;
            let data;
        
            if (Buffer.isBuffer(raw)) {
                type = 'speak.data';
                data = raw;
            } else {
                data = JSON.parse(raw);
                type = data.type;
            }

            if (type !== 'speak.data') {
                console.log('[STREAM APP] Action: ' + type);
            }

            switch (type) {
                case 'auth':
                    handleAuth(data.payload, socket);
                    return;
                case 'speak.start':
                    handleSpeakStart(data.payload, socket);
                    return;
                case 'speak.data':
                    handleSpeakData(data, socket);
                    return;
                case 'speak.stop':
                    handleSpeakStop(data.payload, socket);
                    return;
                default:
                    socket.send(JSON.stringify({
                        type: 'error',
                        payload: `Invalid event type. Received "${type}".`
                    }));
            }

        });
    });

    console.log('Ready');
}

module.exports = {
    startSocket,
};



















// const request = {
//     config: {
//         encoding: 'LINEAR16',
//         sampleRateHertz: 44100,
//         languageCode: 'en-US',
//     },
//     interimResults: true, // If you want interim results, set this to true
// };

// // Create a recognize stream
// const recognizeStream = client
//     .streamingRecognize(request)
//     .on('error', console.error)
//     .on('data', data =>
//         process.stdout.write(
//             data.results[0] && data.results[0].alternatives[0]
//                 ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
//                 : `\n\nReached transcription time limit, press Ctrl+C\n`
//         )
//     );

// console.log(recognizeStream);
