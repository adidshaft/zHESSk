// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Chess } = require('chess.js');
const MockZiskProver = require('./mock-zisk-prover');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

const games = new Map();
const prover = new MockZiskProver();

// Initialize the prover
prover.compileProgram().then(() => {
    console.log('Zhessk chess validator program compiled successfully');
}).catch(console.error);

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
    const proofs = prover.getProofHistory();
    res.json(proofs);
});

app.get('/api/stats', (req, res) => {
    const proofs = prover.getProofHistory();
    const stats = {
        totalProofs: proofs.length,
        averageExecutionTime: proofs.reduce((sum, p) => sum + p.executionTime, 0) / proofs.length || 0,
        totalGames: games.size,
        averageProofSize: proofs.reduce((sum, p) => sum + p.proofSize, 0) / proofs.length || 0
    };
    res.json(stats);
});

// Socket.IO for real-time updates
io