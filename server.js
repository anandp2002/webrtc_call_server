import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import roomManager from './roomManager.js';

const app = express();
const httpServer = createServer(app);

// Configure CORS
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));

// Socket.io setup with CORS
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create a new room
    socket.on('create-room', () => {
        const roomId = roomManager.createRoom();
        socket.emit('room-created', { roomId });
    });

    // Join an existing room
    socket.on('join-room', ({ roomId }) => {
        console.log(`📥 Join request - Socket: ${socket.id}, Room: ${roomId}`);

        // Check if socket is already in the room
        const room = roomManager.rooms.get(roomId);
        if (room && room.participants.has(socket.id)) {
            console.log(`⚠️  Socket ${socket.id} already in room ${roomId}, skipping join`);
            socket.emit('room-joined', {
                roomId,
                isFirstParticipant: room.participants.size === 1
            });
            return;
        }

        const result = roomManager.joinRoom(roomId, socket.id);

        if (!result.success) {
            console.log(`❌ Join failed: ${result.error} - Room ${roomId} has ${room ? room.participants.size : 0} participants`);
            socket.emit('join-error', { error: result.error });
            return;
        }

        // Join the socket.io room
        socket.join(roomId);
        socket.emit('room-joined', {
            roomId,
            isFirstParticipant: result.isFirstParticipant
        });

        // Notify the other participant
        if (!result.isFirstParticipant) {
            const otherParticipant = roomManager.getOtherParticipant(roomId, socket.id);
            if (otherParticipant) {
                io.to(otherParticipant).emit('peer-joined', { peerId: socket.id });
            }
        }

        console.log(`✅ Socket ${socket.id} joined room ${roomId} (${result.participantCount}/2)`);
    });

    // WebRTC signaling: Offer
    socket.on('offer', ({ roomId, offer }) => {
        const otherParticipant = roomManager.getOtherParticipant(roomId, socket.id);
        if (otherParticipant) {
            io.to(otherParticipant).emit('offer', {
                offer,
                senderId: socket.id
            });
            console.log(`Offer sent from ${socket.id} to ${otherParticipant}`);
        }
    });

    // WebRTC signaling: Answer
    socket.on('answer', ({ roomId, answer }) => {
        const otherParticipant = roomManager.getOtherParticipant(roomId, socket.id);
        if (otherParticipant) {
            io.to(otherParticipant).emit('answer', {
                answer,
                senderId: socket.id
            });
            console.log(`Answer sent from ${socket.id} to ${otherParticipant}`);
        }
    });

    // WebRTC signaling: ICE Candidate
    socket.on('ice-candidate', ({ roomId, candidate }) => {
        const otherParticipant = roomManager.getOtherParticipant(roomId, socket.id);
        if (otherParticipant) {
            io.to(otherParticipant).emit('ice-candidate', {
                candidate,
                senderId: socket.id
            });
            console.log(`ICE candidate sent from ${socket.id} to ${otherParticipant}`);
        }
    });

    // Media state changes: Video toggle
    socket.on('video-toggle', ({ roomId, isVideoEnabled }) => {
        const otherParticipant = roomManager.getOtherParticipant(roomId, socket.id);
        if (otherParticipant) {
            io.to(otherParticipant).emit('peer-video-toggle', { isVideoEnabled });
            console.log(`📹 Video ${isVideoEnabled ? 'enabled' : 'disabled'} by ${socket.id}`);
        }
    });

    // Media state changes: Audio toggle
    socket.on('audio-toggle', ({ roomId, isAudioEnabled }) => {
        const otherParticipant = roomManager.getOtherParticipant(roomId, socket.id);
        if (otherParticipant) {
            io.to(otherParticipant).emit('peer-audio-toggle', { isAudioEnabled });
            console.log(`🎤 Audio ${isAudioEnabled ? 'enabled' : 'disabled'} by ${socket.id}`);
        }
    });

    // Leave room
    socket.on('leave-room', ({ roomId }) => {
        handleLeaveRoom(socket, roomId);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const removedRooms = roomManager.removeUserFromAllRooms(socket.id);

        // Notify other participants in those rooms
        removedRooms.forEach(roomId => {
            socket.to(roomId).emit('peer-left');
        });
    });
});

// Helper function to handle leaving a room
function handleLeaveRoom(socket, roomId) {
    const otherParticipant = roomManager.getOtherParticipant(roomId, socket.id);

    roomManager.leaveRoom(roomId, socket.id);
    socket.leave(roomId);

    // Notify the other participant
    if (otherParticipant) {
        io.to(otherParticipant).emit('peer-left');
    }

    socket.emit('left-room', { roomId });
    console.log(`Socket ${socket.id} left room ${roomId}`);
}

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`🚀 WebRTC signaling server running on port ${PORT}`);
    console.log(`📡 Socket.io ready for connections`);
});
