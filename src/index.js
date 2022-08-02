var { startSocket } = require('./app');

/**
 * Get port from environment and store in Express.
 */
var port = normalizePort(process.env.PORT || '8080');

/**
 * Set up the socket with the server
 */
startSocket({
    port,
});

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}
