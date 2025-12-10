import { v4 as uuidv4 } from 'uuid';

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomId -> { participants: Set, createdAt: Date }
    }

    // Generate a unique 6-digit room ID
    generateRoomId() {
        let roomId;
        do {
            roomId = Math.floor(100000 + Math.random() * 900000).toString();
        } while (this.rooms.has(roomId));
        return roomId;
    }

    // Create a new room
    createRoom() {
        const roomId = this.generateRoomId();
        this.rooms.set(roomId, {
            participants: new Set(),
            createdAt: new Date()
        });
        console.log(`Room created: ${roomId}`);
        return roomId;
    }

    // Join a room
    joinRoom(roomId, socketId) {
        const room = this.rooms.get(roomId);

        if (!room) {
            return { success: false, error: 'Room not found' };
        }

        if (room.participants.size >= 2) {
            return { success: false, error: 'Room is full' };
        }

        room.participants.add(socketId);
        console.log(`User ${socketId} joined room ${roomId}. Total participants: ${room.participants.size}`);

        return {
            success: true,
            participantCount: room.participants.size,
            isFirstParticipant: room.participants.size === 1
        };
    }

    // Leave a room
    leaveRoom(roomId, socketId) {
        const room = this.rooms.get(roomId);

        if (!room) {
            return { success: false, error: 'Room not found' };
        }

        room.participants.delete(socketId);
        console.log(`User ${socketId} left room ${roomId}. Remaining participants: ${room.participants.size}`);

        // Delete room if empty
        if (room.participants.size === 0) {
            this.rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
        }

        return { success: true, remainingParticipants: room.participants.size };
    }

    // Get the other participant in a room
    getOtherParticipant(roomId, socketId) {
        const room = this.rooms.get(roomId);

        if (!room) {
            return null;
        }

        const participants = Array.from(room.participants);
        return participants.find(id => id !== socketId) || null;
    }

    // Check if room exists
    roomExists(roomId) {
        return this.rooms.has(roomId);
    }

    // Get room info
    getRoomInfo(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return null;
        }

        return {
            roomId,
            participantCount: room.participants.size,
            createdAt: room.createdAt
        };
    }

    // Remove user from all rooms (for disconnect handling)
    removeUserFromAllRooms(socketId) {
        const roomsToDelete = [];

        for (const [roomId, room] of this.rooms.entries()) {
            if (room.participants.has(socketId)) {
                room.participants.delete(socketId);
                console.log(`User ${socketId} removed from room ${roomId}`);

                if (room.participants.size === 0) {
                    roomsToDelete.push(roomId);
                }
            }
        }

        // Clean up empty rooms
        roomsToDelete.forEach(roomId => {
            this.rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty after disconnect)`);
        });

        return roomsToDelete;
    }
}

export default new RoomManager();
