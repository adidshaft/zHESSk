// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Chess } = require('chess.js');
const MockZiskProver = require('./mock-zisk-prover');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));
app.use(express.json());

const games = new Map();
const prover = new MockZiskProver();

// Initialize the prover
prover.compileProgram().then(() => {
    console.log('Zhessk chess validator program compiled successfully');
}).catch(console.error);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Zhessk server is running' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/game/new', async (req, res) => {
    try {
        const gameId = generateGameId();
        const chess = new Chess();
        
        const gameState = {
            id: gameId,
            chess: chess,
            fen: chess.fen(),
            moves: [],
            moveNumber: 0,
            turn: 'w',
            status: 'active'
        };

        games.set(gameId, gameState);
        
        // Generate initial proof
        const initialProof = await prover.generateProof(gameState);
        
        res.json({
            gameId,
            fen: chess.fen(),
            proof: initialProof,
            message: 'Game created with Zhessk proof verification'
        });
    } catch (error) {
        console.error('Error creating new game:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/game/:gameId/move', async (req, res) => {
    const { gameId } = req.params;
    const { from, to } = req.body;
    
    const game = games.get(gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    try {
        // Store previous state for proof
        const previousState = {
            fen: game.fen,
            moveNumber: game.moveNumber
        };

        const move = game.chess.move({ from, to });
        if (!move) {
            return res.status(400).json({ error: 'Invalid move' });
        }

        // Update game state
        game.moves.push(move);
        game.moveNumber++;
        game.fen = game.chess.fen();
        game.turn = game.chess.turn();
        game.lastMove = move;

        // Generate ZK proof for the move
        console.log(`Generating Zhessk proof for move ${move.san}...`);
        const proof = await prover.generateProof(game);
        
        // Emit to all connected clients
        io.emit('moveUpdate', {
            gameId,
            move,
            fen: game.fen,
            proof,
            previousState
        });

        res.json({
            move,
            fen: game.fen,
            proof,
            gameStatus: getGameStatus(game.chess),
            message: `Move verified with Zhessk proof in ${proof.executionTime.toFixed(2)}ms`
        });

    } catch (error) {
        console.error('Move processing error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/game/:gameId/proofs', (req, res) => {
    try {
        const proofs = prover.getProofHistory();
        res.json(proofs);
    } catch (error) {
        console.error('Error fetching proofs:', error);
        res.status(500).json({ error: 'Failed to fetch proofs' });
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const proofs = prover.getProofHistory();
        const stats = {
            totalProofs: proofs.length,
            averageExecutionTime: proofs.reduce((sum, p) => sum + p.executionTime, 0) / proofs.length || 0,
            totalGames: games.size,
            averageProofSize: proofs.reduce((sum, p) => sum + p.proofSize, 0) / proofs.length || 0
        };
        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('joinGame', (gameId) => {
        socket.join(gameId);
        console.log(`Client ${socket.id} joined game ${gameId}`);
    });

    socket.on('requestProofGeneration', async (data) => {
        try {
            const game = games.get(data.gameId);
            if (game) {
                const proof = await prover.generateProof(game);
                socket.emit('proofGenerated', { proof });
            }
        } catch (error) {
            console.error('Proof generation error:', error);
            socket.emit('proofError', { error: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

function generateGameId() {
    return Math.random().toString(36).substring(2, 15);
}

function getGameStatus(chess) {
    if (chess.isCheckmate()) {
        return 'checkmate';
    } else if (chess.isDraw()) {
        return 'draw';
    } else if (chess.isCheck()) {
        return 'check';
    }
    return 'active';
}

// Enhanced server startup with multiple options
const PORT = process.env.PORT || 3000;

const startServer = (port = PORT) => {
    const serverInstance = server.listen(port, '0.0.0.0')
        .on('listening', () => {
            console.log('\n🎯 Zhessk Server Started Successfully!');
            console.log('═══════════════════════════════════════');
            console.log(`✅ Server running on port: ${port}`);
            console.log(`🔗 Local access: http://localhost:${port}`);
            console.log(`🔗 Network access: http://127.0.0.1:${port}`);
            console.log('🔐 Using Mock ZisK Prover (will switch to real ZisK when stable)');
            console.log('🎮 Chess game ready at: http://localhost:' + port);
            console.log('═══════════════════════════════════════\n');
            
            // Test endpoint
            console.log(`📡 Health check: http://localhost:${port}/health`);
        })
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`❌ Port ${port} is busy, trying port ${port + 1}...`);
                startServer(port + 1);
            } else if (err.code === 'EACCES') {
                console.log(`❌ Permission denied on port ${port}, trying port ${port + 1000}...`);
                startServer(port + 1000);
            } else {
                console.error('❌ Server startup error:', err.message);
                console.log('🔄 Retrying with different configuration...');
                
                // Fallback: try without binding to specific host
                server.listen(port)
                    .on('listening', () => {
                        console.log(`✅ Zhessk server running on fallback mode: http://localhost:${port}`);
                    })
                    .on('error', (fallbackErr) => {
                        console.error('❌ Fallback failed:', fallbackErr.message);
                        console.log('🚨 Please check if another service is using this port');
                        console.log('💡 Try: lsof -i :' + port);
                    });
            }
        });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('🔄 Received SIGTERM, shutting down gracefully...');
        serverInstance.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('\n🔄 Received SIGINT, shutting down gracefully...');
        serverInstance.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
};

// Start the server
console.log('🚀 Starting Zhessk ZK Chess Server...');
startServer();