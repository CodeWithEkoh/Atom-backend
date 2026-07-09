const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

app.use(express.json()); 
app.use(cors());

// CRITICAL: This tells Express to serve your index.html and operator.html pages automatically
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            "https://atom-scan.netlify.app",
            "http://localhost:3000",
            "https://atomscan.name.ng", 
            "http://atomscan.name.ng"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

let socketAudienceCount = 0;
let isServerScanning = false; 

// ── 📊 HTTP ACTIVE VISITOR TRACKER ──
let activeHttpViewers = new Map();

// ── 🔒 THE STICKY MEMORY CACHE LAYER ──
let atomCacheState = {
    state: "IDLE", 
    mode: "TARGETED",
    timeLeft: 10,
    liveData: null,
    payload: null
};

// Clean out expired visitor timestamps every 10 seconds
setInterval(() => {
    const now = Date.now();
    for (let [ip, timestamp] of activeHttpViewers.entries()) {
        if (now - timestamp > 12000) { 
            activeHttpViewers.delete(ip);
        }
    }
    io.emit('audience_update', { count: getTotalViewers() });
}, 10000);

function getTotalViewers() {
    return socketAudienceCount + activeHttpViewers.size;
}

// ── 📡 PUBLIC HTTP ENDPOINT FOR THE AUDIENCE ──
// We are using app.post here to cleanly process the cache-busting requests from index.html
app.post('/api/latest-scan', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    activeHttpViewers.set(visitorIp, Date.now());

    res.json(atomCacheState);
});

io.on('connection', (socket) => {
    const role = socket.handshake.query.role || 'viewer';
    console.log(`[System Link] New connection established. Role assigned: ${role}`);

    if (role === 'audience' || role === 'viewer') {
        socketAudienceCount++;
        io.emit('audience_update', { count: getTotalViewers() });
        socket.emit('registration_confirmed'); 
    }

    if (role === 'operator') {
        socket.emit('server_ack', { 
            message: 'Atom Node Pipeline Online', 
            audienceCount: getTotalViewers() 
        });
    }

    // ── INTER-PORT EVENT ROUTING MATRIX ──

    socket.on('scanning_start', (data) => {
        isServerScanning = true; 
        console.log('[Matrix Sync] Operator initiated sweep. Broadcasting state...');
        
        atomCacheState.state = "SCANNING";
        atomCacheState.mode = (data && data.mode) ? data.mode : "TARGETED";
        atomCacheState.timeLeft = 10;
        atomCacheState.liveData = null;
        atomCacheState.payload = null;

        socket.broadcast.emit('operator_scanning', data);
    });

    socket.on('scanning_countdown', (data) => {
        if (!isServerScanning) return; 
        
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
        
        atomCacheState.state = "VERDICT_READY";
        atomCacheState.payload = payload;

        socket.broadcast.emit('verdict', payload);
        socket.emit('broadcast_ack', { sentTo: getTotalViewers(), verdict: payload.verdict });
    });

    socket.on('disconnect', () => {
        console.log(`[System Link] Connection closed. Role departed: ${role}`);
        if (role === 'audience' || role === 'viewer') {
            socketAudienceCount = Math.max(0, socketAudienceCount - 1);
            io.emit('audience_update', { count: getTotalViewers() });
        }
    });
});

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
