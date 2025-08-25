// Enhanced server.js with proof progress broadcasting
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Chess } = require('chess.js');
const SP1ChessProver = require('./sp1-chess-prover'); // Use the enhanced prover
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
const prover = new SP1ChessProver();

// Initialize the prover and emit status updates
prover.compileProgram().then((result) => {
    console.log('✅ Zhessk chess validator program initialized');
    console.log('📊 Proof system status:', result.message);
    
    // Broadcast prover status to all connected clients
    io.emit('proverStatus', prover.getProverStatus());
}).catch(console.error);

app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Zhessk server is running',
        proverStatus: prover.getProverStatus()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'enhanced-frontend.html')); // Use enhanced frontend
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
        
        // Generate initial proof with progress tracking
        console.log('🎯 Generating initial proof for new game...');
        const initialProof = await prover.generateProof(gameState, (progressData) => {
            io.emit('proofProgress', progressData);
        });
        
        // Emit the generated proof
        io.emit('proofGenerated', {
            gameId,
            proof: initialProof,
            move: null
        });
        
        res.json({
            gameId,
            fen: chess.fen(),
            proof: initialProof,
            message: 'Game created with enhanced proof verification',
            proverStatus: prover.getProverStatus()
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

        // Generate proof with real-time progress updates
        console.log(`🔐 Generating ${prover.isUsingRealProofs() ? 'REAL SP1' : 'enhanced mock'} proof for move ${move.san}...`);
        
        const proof = await prover.generateProof(game, (progressData) => {
            // Emit progress to all clients in this game
            io.to(gameId).emit('proofProgress', {
                ...progressData,
                gameId,
                move: move.san
            });
        });
        
        // Emit the completed proof
        io.to(gameId).emit('proofGenerated', {
            gameId,
            move,
            fen: game.fen,
            proof,
            previousState
        });

        // Also emit updated prover status
        io.emit('proverStatus', prover.getProverStatus());

        res.json({
            move,
            fen: game.fen,
            proof,
            gameStatus: getGameStatus(game.chess),
            message: `Move verified with ${proof.isReal ? 'real SP1' : 'enhanced mock'} proof in ${proof.executionTime?.toFixed(2) || 0}ms`,
            proverStatus: prover.getProverStatus()
        });

    } catch (error) {
        console.error('Move processing error:', error);
        
        // Emit error to clients
        io.to(gameId).emit('proofProgress', {
            gameId,
            stage: 'error',
            message: 'Proof generation failed',
            error: error.message
        });
        
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/game/:gameId/manual-proof', async (req, res) => {
    const { gameId } = req.params;
    const game = games.get(gameId);
    
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    try {
        console.log('🔧 Generating manual proof for current game state...');
        
        const proof = await prover.generateProof(game, (progressData) => {
            io.to(gameId).emit('proofProgress', {
                ...progressData,
                gameId,
                move: 'Manual Proof'
            });
        });
        
        io.to(gameId).emit('proofGenerated', {
            gameId,
            proof,
            move: { san: 'Manual Proof' },
            manual: true
        });

        res.json({
            proof,
            message: `Manual proof generated in ${proof.executionTime?.toFixed(2) || 0}ms`
        });
    } catch (error) {
        console.error('Manual proof generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/game/:gameId/proofs', (req, res) => {
    try {
        const proofs = prover.getProofHistory();
        res.json({
            proofs,
            proverStatus: prover.getProverStatus(),
            totalProofs: proofs.length,
            realProofs: proofs.filter(p => p.isReal).length,
            mockProofs: proofs.filter(p => p.isMock).length
        });
    } catch (error) {
        console.error('Error fetching proofs:', error);
        res.status(500).json({ error: 'Failed to fetch proofs' });
    }
});

app.get('/api/proof/:proofId', (req, res) => {
    try {
        const { proofId } = req.params;
        const proof = prover.getProofById(proofId);
        
        if (!proof) {
            return res.status(404).json({ error: 'Proof not found' });
        }
        
        res.json({
            proof,
            message: `Proof details for ${proof.isReal ? 'real SP1' : 'enhanced mock'} proof`
        });
    } catch (error) {
        console.error('Error fetching proof details:', error);
        res.status(500).json({ error: 'Failed to fetch proof details' });
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const proverStatus = prover.getProverStatus();
        const proofs = prover.getProofHistory();
        
        const stats = {
            ...proverStatus,
            averageExecutionTime: proofs.reduce((sum, p) => sum + (p.executionTime || 0), 0) / proofs.length || 0,
            totalGames: games.size,
            averageProofSize: proofs.reduce((sum, p) => sum + (p.proofSize || 0), 0) / proofs.length || 0,
            realProofPercentage: proverStatus.totalProofs > 0 ? 
                (proverStatus.realProofs / proverStatus.totalProofs) * 100 : 0
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
    console.log('🔗 Client connected:', socket.id);
    
    // Send current prover status to new client
    socket.emit('proverStatus', prover.getProverStatus());
    
    socket.on('joinGame', (gameId) => {
        socket.join(gameId);
        console.log(`👤 Client ${socket.id} joined game ${gameId}`);
        
        // Send current game state and recent proofs
        const game = games.get(gameId);
        if (game) {
            socket.emit('gameState', {
                gameId,
                fen: game.fen,
                turn: game.turn,
                moveNumber: game.moveNumber,
                moves: game.moves
            });
        }
    });

    socket.on('requestProofDetails', async (proofId) => {
        try {
            const proof = prover.getProofById(proofId);
            if (proof) {
                socket.emit('proofDetails', { proof });
            } else {
                socket.emit('proofError', { error: 'Proof not found' });
            }
        } catch (error) {
            console.error('Proof details error:', error);
            socket.emit('proofError', { error: error.message });
        }
    });

    socket.on('requestProverStatus', () => {
        socket.emit('proverStatus', prover.getProverStatus());
    });

    socket.on('disconnect', () => {
        console.log('👋 Client disconnected:', socket.id);
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

// Enhanced server startup
const PORT = process.env.PORT || 8080;

const startServer = (port = PORT) => {
    const serverInstance = server.listen(port, '0.0.0.0')
        .on('listening', () => {
            console.log('\n🎯 Zhessk Enhanced Server Started Successfully!');
            console.log('═══════════════════════════════════════════════════');
            console.log(`✅ Server running on port: ${port}`);
            console.log(`🔗 Local access: http://localhost:${port}`);
            console.log(`🔗 Network access: http://127.0.0.1:${port}`);
            console.log(`🔐 Proof system: ${prover.isUsingRealProofs() ? 'Real SP1 STARK Proofs' : 'Enhanced Mock Proofs'}`);
            console.log('🎮 Enhanced chess game with proof visualization ready!');
            console.log('═══════════════════════════════════════════════════\n');
            
            console.log(`📡 Health check: http://localhost:${port}/health`);
            console.log(`📊 Statistics: http://localhost:${port}/api/stats`);
            console.log(`🔐 Proof history: http://localhost:${port}/api/game/[gameId]/proofs`);
        })
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`❌ Port ${port} is busy, trying port ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('❌ Server startup error:', err.message);
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

console.log('🚀 Starting Zhessk Enhanced ZK Chess Server...');
startServer();