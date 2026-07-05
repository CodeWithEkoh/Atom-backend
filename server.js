const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            "https://atom-scan.netlify.app",
            "http://localhost:3000"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

let audienceCount = 0;

io.on('connection', (socket) => {
    // Gracefully handles if query parameter uses 'audience' or 'viewer'
    const role = socket.handshake.query.role || 'viewer';
    console.log(`[System Link] New connection established. Role assigned: ${role}`);

    if (role === 'audience' || role === 'viewer') {
        audienceCount++;
        io.emit('audience_update', { count: audienceCount });
        socket.emit('registration_confirmed'); 
    }

    // Explicit sync packet pushed directly to the control dashboard console
    if (role === 'operator') {
        socket.emit('server_ack', { 
            message: 'Atom Node Pipeline Online', 
            audienceCount: audienceCount 
        });
    }

    // ── INTER-PORT EVENT ROUTING MATRIX ──

    // 1. Catch scan start signal from operator and mirror it immediately to all audience channels
    socket.on('scanning_start', (data) => {
        console.log('[Matrix Sync] Operator initiated sweep. Broadcasting state...');
        socket.broadcast.emit('operator_scanning', data);
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
        if (role === 'audience' || role === 'viewer') {
            audienceCount = Math.max(0, audienceCount - 1);
            io.emit('audience_update', { count: audienceCount });
        }
    });
});

// Dynamic assignment fallback parameters for cloud servers like Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n┌─────────────────────────────────┐');
    console.log('│  Atom Drug Guard - Relay Server │');
    console.log(`│  Port   : ${PORT}                  │`);
    console.log('│  Status : ONLINE                │');
    console.log('└─────────────────────────────────┘\n');
});
