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
let isServerScanning = false; // System safety valve

io.on('connection', (socket) => {
    const role = socket.handshake.query.role || 'viewer';
    console.log(`[System Link] New connection established. Role assigned: ${role}`);

    if (role === 'audience' || role === 'viewer') {
        // ── 🔒 THE GATEKEEPER VALVE ──
        // If 50 students are locked in, reject the 51st seamlessly
        if (audienceCount >= 50) {
            socket.emit('room_full', { message: "Audience capacity reached (50/50)." });
            socket.disconnect(true); // Evict immediately to save memory sockets
            return;
        }

        audienceCount++;
        io.emit('audience_update', { count: audienceCount });
        socket.emit('registration_confirmed'); 
    }

    if (role === 'operator') {
        socket.emit('server_ack', { 
            message: 'Atom Node Pipeline Online', 
            audienceCount: audienceCount 
        });
    }

    // ── INTER-PORT EVENT ROUTING MATRIX ──

    socket.on('scanning_start', (data) => {
        isServerScanning = true; // Open the telemetry gate
        console.log('[Matrix Sync] Operator initiated sweep. Broadcasting state...');
        socket.broadcast.emit('operator_scanning', data);
    });

    socket.on('scanning_countdown', (data) => {
        // Drop countdown metrics instantly if the server scan state is closed
        if (!isServerScanning) return; 
        socket.broadcast.emit('scan_countdown', data);
    });

    socket.on('verdict', (payload) => {
        isServerScanning = false; // Slam the telemetry gate shut!
        console.log(`[Analysis Complete] Broadcast Verdict: ${payload.verdict}`);
        socket.broadcast.emit('verdict', payload);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n┌─────────────────────────────────┐');
    console.log('│  Atom Drug Guard - Relay Server │');
    console.log(`│  Port   : ${PORT}                  │`);
    console.log('│  Status : ONLINE                │');
    console.log('└─────────────────────────────────┘\n');
});
