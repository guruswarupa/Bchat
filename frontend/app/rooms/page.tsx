'use client';

import { useState, useEffect } from 'react';

interface Room {
  room_id: string;
  room_name: string;
  description: string;
  created_by: string;
  is_private: boolean;
  room_type: string;
  created_at: string;
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoom, setNewRoom] = useState({
    room_name: '',
    description: '',
    is_private: false,
    room_pin: ''
  });

  const getApiBase = () => {
    return 'http://localhost:5000';
  };

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/rooms`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRooms(data);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newRoom)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Room created:', result);
        setShowCreateForm(false);
        setNewRoom({ room_name: '', description: '', is_private: false, room_pin: '' });
        fetchRooms(); // Refresh rooms list
      } else {
        alert('Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room');
    }
  };

  const joinRoom = async (roomId: string, isPrivate: boolean = false) => {
    if (isPrivate) {
      // For private rooms, prompt for PIN first
      const pin = prompt('This is a private room. Please enter the PIN:');
      if (!pin) return; // User cancelled
      
      try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/rooms/${roomId}/verify-pin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ pin })
        });

        if (response.ok) {
          // PIN verified, redirect to room
          window.location.href = `/?room=${roomId}`;
        } else {
          alert('Invalid PIN. Access denied.');
        }
      } catch (error) {
        console.error('Error verifying PIN:', error);
        alert('Error verifying PIN. Please try again.');
      }
    } else {
      // Public room, join directly
      window.location.href = `/?room=${roomId}`;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');

    if (token && storedUsername) {
      setIsLoggedIn(true);
      fetchRooms();
    } else {
      // Redirect to login if not authenticated
      window.location.href = '/';
    }
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">
        <div className="bg-[#2c2c2e] p-8 rounded-xl shadow-xl text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to view rooms</h1>
          <a href="/" className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors">
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-white">
      {/* Header */}
      <div className="bg-[#2c2c2e] shadow-sm p-4 sm:p-6 border-b border-[#3a3a3c]">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-white">Room Management</h1>
            <p className="text-gray-400">Manage and join chat rooms</p>
          </div>
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Create Room
            </button>
            <a
              href="/"
              className="bg-[#48484a] text-white px-4 py-2 rounded-md hover:bg-[#5c5c5e] transition-colors text-center"
            >
              Back to Chat
            </a>
          </div>
        </div>
      </div>

      {/* Create Room Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-white">Create New Room</h3>
            <form onSubmit={createRoom} className="space-y-4">
              <input
                type="text"
                placeholder="Room Name"
                value={newRoom.room_name}
                onChange={(e) => setNewRoom(prev => ({ ...prev, room_name: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
              <textarea
                placeholder="Description (optional)"
                value={newRoom.description}
                onChange={(e) => setNewRoom(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                rows={3}
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="private"
                  checked={newRoom.is_private}
                  onChange={(e) => setNewRoom(prev => ({ ...prev, is_private: e.target.checked }))}
                  className="rounded border-[#48484a] bg-[#3a3a3c] text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="private" className="text-white">Private Room</label>
              </div>
              {newRoom.is_private && (
                <input
                  type="password"
                  placeholder="Room PIN"
                  value={newRoom.room_pin}
                  onChange={(e) => setNewRoom(prev => ({ ...prev, room_pin: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                  required
                />
              )}
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRoom({ room_name: '', description: '', is_private: false, room_pin: '' });
                  }}
                  className="bg-[#48484a] text-white px-4 py-2 rounded-md hover:bg-[#5c5c5e] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rooms List */}
      <div className="p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Default Rooms */}
          <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-sm border-l-4 border-green-500">
            <h3 className="text-lg font-semibold mb-2 text-white"># general</h3>
            <p className="text-gray-400 mb-4">General discussion room</p>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-400 bg-green-900/20 px-2 py-1 rounded-md">Public</span>
              <button
                onClick={() => joinRoom('general', false)}
                className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition-colors"
              >
                Join
              </button>
            </div>
          </div>

          <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-sm border-l-4 border-green-500">
            <h3 className="text-lg font-semibold mb-2 text-white"># tech</h3>
            <p className="text-gray-400 mb-4">Technology discussions</p>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-400 bg-green-900/20 px-2 py-1 rounded-md">Public</span>
              <button
                onClick={() => joinRoom('tech', false)}
                className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition-colors"
              >
                Join
              </button>
            </div>
          </div>

          <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-sm border-l-4 border-green-500">
            <h3 className="text-lg font-semibold mb-2 text-white"># random</h3>
            <p className="text-gray-400 mb-4">Random topics and discussions</p>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-400 bg-green-900/20 px-2 py-1 rounded-md">Public</span>
              <button
                onClick={() => joinRoom('random', false)}
                className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition-colors"
              >
                Join
              </button>
            </div>
          </div>

          {/* Custom Rooms */}
          {rooms.map((room) => (
            <div key={room.room_id} className="bg-[#2c2c2e] p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
              <h3 className="text-lg font-semibold mb-2 text-white"># {room.room_name}</h3>
              <p className="text-gray-400 mb-4">{room.description || 'No description'}</p>
              <div className="flex justify-between items-center">
                <span className={`text-sm px-2 py-1 rounded-md ${
                  room.is_private 
                    ? 'text-orange-400 bg-orange-900/20' 
                    : 'text-green-400 bg-green-900/20'
                }`}>
                  {room.is_private ? 'Private' : 'Public'}
                </span>
                <button
                  onClick={() => joinRoom(room.room_id, room.is_private)}
                  className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Join
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Created {new Date(room.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>

        {rooms.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">No custom rooms created yet. Create your first room!</p>
          </div>
        )}
      </div>
    </div>
  );
}
