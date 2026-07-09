import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));

app.use(express.json());

// Resolve paths for executable
// In Docker/Linux: the binary is compiled as "lab4" (no .exe)
// Locally on Windows: the binary is "lab4.exe"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDocker = process.env.DOCKER === 'true';
const binaryName = isDocker ? 'lab4' : 'lab4.exe';
const labExecutable = isDocker
    ? path.resolve('/app', binaryName)
    : path.resolve(__dirname, '..', binaryName);

// Health check endpoint (Render uses this to verify the service is alive)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', engine: 'CPU Scheduling Backend', binary: labExecutable });
});

// Helper to construct the input string for the C++ program
const generateInputString = (operation, algorithms, lastInstant, processes) => {
    const algoStr = algorithms.join(',');
    const processCount = processes.length;

    // Process format: Name,Arrival,Service
    const processesStr = processes.map(p => `${p.name},${p.arrival},${p.service}`).join(' ');

    return `${operation} ${algoStr} ${lastInstant} ${processCount} ${processesStr}`;
};

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('start_realtime_simulation', (payload) => {
        try {
            const { operation, algorithms, lastInstant, processes } = payload;
            
            if (!operation || !algorithms || !lastInstant || !processes) {
                socket.emit('simulation_error', { error: 'Missing required parameters' });
                return;
            }

            const inputData = generateInputString(operation, algorithms, lastInstant, processes);
            const child = spawn(labExecutable, { timeout: 10000 });

            let stdoutAccumulator = '';
            let stderrAccumulator = '';

            child.stdout.on('data', (chunk) => {
                stdoutAccumulator += chunk.toString();
            });

            child.stderr.on('data', (chunk) => {
                stderrAccumulator += chunk.toString();
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    socket.emit('simulation_error', { error: `Simulation failed with code ${code}`, stderr: stderrAccumulator });
                    return;
                }
                
                // Send the full buffer down the socket channel for parsing
                socket.emit('simulation_stream_chunk', { data: stdoutAccumulator });
                socket.emit('simulation_finished', { status: 'done' });
            });

            child.on('error', (err) => {
                socket.emit('simulation_error', { error: 'Failed to initiate scheduling engine: ' + err.message });
            });

            // Add error handler to stdin to prevent EPIPE from crashing the server
            child.stdin.on('error', (err) => {
                console.error('Error writing to child process stdin:', err.message);
            });

            child.stdin.write(inputData + '\n');
            child.stdin.end();

        } catch (err) {
            console.error(err);
            socket.emit('simulation_error', { error: 'Server crashed while handling socket request.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

app.post('/api/simulate', (req, res) => {
    try {
        const { operation, algorithms, lastInstant, processes } = req.body;

        if (!operation || !algorithms || !lastInstant || !processes) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const inputData = generateInputString(operation, algorithms, lastInstant, processes);

        // Spawn the executable asynchronously—zero blocking on the main Node event loop
        const child = spawn(labExecutable, { timeout: 10000 });

        let stdoutAccumulator = '';
        let stderrAccumulator = '';

        // Capture data chunks asynchronously as soon as C++ calls flush/endl
        child.stdout.on('data', (chunk) => {
            stdoutAccumulator += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderrAccumulator += chunk.toString();
        });

        // Fire on process termination
        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`C++ Engine exited with bad status code: ${code}`);
                return res.status(500).json({ 
                    error: `Simulation failed with code ${code}`, 
                    stderr: stderrAccumulator 
                });
            }

            // Return the full, non-fragmented layout back to React
            try {
                const simulationMatrix = JSON.parse(stdoutAccumulator);
                res.json({ success: true, data: simulationMatrix });
            } catch (e) {
                console.error("Failed to parse JSON from C++ engine:", e.message);
                res.status(500).json({ error: "Invalid JSON output from core engine.", rawOutput: stdoutAccumulator });
            }
        });

        // Catch low-level process instantiation errors
        child.on('error', (err) => {
            console.error('Failed to boot C++ child process:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to initiate scheduling engine.' });
            }
        });

        // Add error handler to stdin to prevent EPIPE from crashing the server
        child.stdin.on('error', (err) => {
            console.error('Error writing to child process stdin:', err.message);
        });

        // Write directly to the standard input stream of the isolated binary
        child.stdin.write(inputData + '\n');
        child.stdin.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server crashed while handling request.' });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`CPU Scheduling Backend running on port ${PORT}`);
    console.log(`Binary path: ${labExecutable}`);
});
