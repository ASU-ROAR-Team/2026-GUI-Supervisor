// server.js — static file server only
// WebSocket + ROS2 bridge is handled by ws_ros2_bridge.py on port 8080

const express = require('express');
const http    = require('http');
const path    = require('path');

const app    = express();
const server = http.createServer(app);

const PORT = 8081;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () =>
    console.log(`🚀 OpenMCT running at http://localhost:${PORT}`)
);