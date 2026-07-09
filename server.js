const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Enable JSON parsing middleware so the backend can process raw HTTP payloads if needed
app.use(express.json()); 
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            "https://atom-scan.netlify.app",
            "http://localhost:3000",
            "https://atomscan.name.ng", // Added your custom domain to allow audience requests safely
            "http://atomscan.name.ng"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

let audienceCount = 0;
let isServerScanning = false; 

// ── 🔒 THE STICKY MEMORY CACHE LAYER ──
// This object acts as the permanent source of truth for the 600 HTTP polling devices.
let atomCacheState = {
    state: "IDLE", // Can be: IDLE, SCANNING, VERDICT_READY
    mode: "TARGETED",
    timeLeft: 10,
    liveData: null,
    payload: null
};

// ── 📡 NEW EXPLICIT PUBLIC HTTP ENDPOINT FOR THE AUDIENCE ──
app.get('/api/latest-scan', (req, res) => {
    // Force modern devices to completely bypass network caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Serve the lightweight system status JSON snapshot
    res.json(atomCacheState);
});

io.on('connection', (socket) => {
    const role = socket.handshake.query.role || 'viewer';
    console.log(`[System Link] New connection established. Role assigned: ${role}`);

    // If a device still connects over raw websockets, we handle it natively
    if (role === 'audience' || role === 'viewer') {
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

    // ── INTER-PORT EVENT ROUTING MATRIX (WITH CACHE CAPTURE) ──

    socket.on('scanning_start', (data) => {
        isServerScanning = true; 
        console.log('[Matrix Sync] Operator initiated sweep. Broadcasting state...');
        
        // 1. Update the HTTP cache state instantly for incoming phone requests
        atomCacheState.state = "SCANNING";
        atomCacheState.mode = (data && data.mode) ? data.mode : "TARGETED";
        atomCacheState.timeLeft = 10;
        atomCacheState.liveData = null;
        atomCacheState.payload = null;

        socket.broadcast.emit('operator_scanning', data);
    });

    socket.on('scanning_countdown', (data) => {
        if (!isServerScanning) return; 
        
        // 2. Stream real-time mid-scan telemetry numbers straight into the sticky snapshot
        atomCacheState.state = "SCANNING";
        if (data) {
            atomCacheState.timeLeft = data.timeLeft;
            if (data.liveData) {
                atomCacheState.liveData = data.liveData;
            }
        }

        socket.broadcast.emit('scan_countdown', data);
    });

    socket.on('verdict', (payload) => {
        isServerScanning = false; 
        console.log(`[Analysis Complete] Broadcast Verdict: ${payload.verdict}`);
        
        // 3. Move the final matrix result here. It stays STICKY and frozen until you start the NEXT scan.
        atomCacheState.state = "VERDICT_READY";
        atomCacheState.payload = payload;

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

// Added an optional administrative reset route in case you ever want to force clean back to idle manually
app.get('/api/system/reset-idle', (req, res) => {
    isServerScanning = false;
    atomCacheState = { state: "IDLE", mode: "TARGETED", timeLeft: 10, liveData: null, payload: null };
    res.send("Atom cache cleared back to IDLE.");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n┌─────────────────────────────────┐');
    console.log('│  Atom Drug Guard - Relay Server │');
    console.log(`│  Port   : ${PORT}                  │`);
    console.log('│  Status : ONLINE                │');
    console.log('└─────────────────────────────────┘\n');
});
