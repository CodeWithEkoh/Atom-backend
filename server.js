const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let audienceCount = 0;

io.on('connection', (socket) => {
    const role = socket.handshake.query.role || 'viewer';
    console.log(`[System Link] New connection established. Role assigned: ${role}`);

    if (role === 'audience') {
        audienceCount++;
        io.emit('audience_update', { count: audienceCount });
        // Send an explicit confirmation back to this specific client so it knows it's truly registered
        socket.emit('registration_confirmed'); 
    }

    // Give the operator a clean acknowledgment upon connection
    if (role === 'operator') {
        socket.emit('server_ack', { message: 'Atom Node Pipeline Online', audienceCount: audienceCount });
    }

    // ── INTER-PORT EVENT ROUTING MATRIX ──

    // 1. Catch scan start signal from operator and mirror it immediately to all audience channels
    socket.on('scanning_start', () => {
        console.log('[Matrix Sync] Operator initiated sweep. Broadcasting state...');
        socket.broadcast.emit('operator_scanning');
    });

    // 2. Capture live ticking countdown increments and pass them to audience nodes
    socket.on('scanning_countdown', (data) => {
        socket.broadcast.emit('scan_countdown', data);
    });

    // 3. Catch final biometric verification arrays and push them to audience screens
    socket.on('verdict', (payload) => {
        console.log(`[Analysis Complete] Broadcast Verdict: ${payload.verdict} (${payload.drug})`);
        socket.broadcast.emit('verdict_broadcast', payload);
        socket.emit('broadcast_ack', { sentTo: audienceCount, verdict: payload.verdict });
    });

    socket.on('disconnect', () => {
        console.log(`[System Link] Connection closed. Role departed: ${role}`);
        if (role === 'audience') {
            audienceCount = Math.max(0, audienceCount - 1);
            io.emit('audience_update', { count: audienceCount });
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log('\n┌─────────────────────────────────┐');
    console.log('│  Atom Drug Guard - Relay Server │');
    console.log(`│  Port   : ${PORT}                  │`);
    console.log('│  Status : ONLINE                │');
    console.log('└─────────────────────────────────┘\n');
});