// server.js — OpenMCT GUI Static Server & WebSocket Proxy
// Serves OpenMCT GUI on port 8081

const express = require('express');
const http    = require('http');
const path    = require('path');
const net     = require('net');

const app = express();

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy WebSocket upgrade requests to backend ROS2 bridge (ws_ros2_bridge.py on port 9091)
function attachWsProxy(server) {
    server.on('upgrade', (req, socket, head) => {
        const target = net.connect(9091, '127.0.0.1', () => {
            target.write(req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\r\n');
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                target.write(req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\r\n');
            }
            target.write('\r\n');
            if (head && head.length) target.write(head);
            socket.pipe(target);
            target.pipe(socket);
        });

        target.on('error', (err) => {
            console.error('WS Proxy error on upgrade:', err.message);
            socket.destroy();
        });

        socket.on('error', () => target.destroy());
    });
}

// Server on port 8081
const server8081 = http.createServer(app);
attachWsProxy(server8081);
server8081.listen(8081, () => {
    console.log('🚀 OpenMCT GUI running at http://localhost:8081');
});