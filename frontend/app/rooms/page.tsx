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

  const joinRoom = (roomId: string) => {
    // Redirect to main chat page with the specific room
    window.location.href = `/?room=${roomId}`;
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to view rooms</h1>
          <a href="/" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 border-b">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Room Management</h1>
            <p className="text-gray-600">Manage and join chat rooms</p>
          </div>
          <div className="space-x-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Create Room
            </button>
            <a
              href="/"
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 inline-block"
            >
              Back to Chat
            </a>
          </div>
        </div>
      </div>

      {/* Create Room Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96">
            <h3 className="text-lg font-semibold mb-4">Create New Room</h3>
            <form onSubmit={createRoom} className="space-y-4">
              <input
                type="text"
                placeholder="Room Name"
                value={newRoom.room_name}
                onChange={(e) => setNewRoom(prev => ({ ...prev, room_name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
              <textarea
                placeholder="Description (optional)"
                value={newRoom.description}
                onChange={(e) => setNewRoom(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="private"
                  checked={newRoom.is_private}
                  onChange={(e) => setNewRoom(prev => ({ ...prev, is_private: e.target.checked }))}
                />
                <label htmlFor="private">Private Room</label>
              </div>
              {newRoom.is_private && (
                <input
                  type="password"
                  placeholder="Room PIN"
                  value={newRoom.room_pin}
                  onChange={(e) => setNewRoom(prev => ({ ...prev, room_pin: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                />
              )}
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRoom({ room_name: '', description: '', is_private: false, room_pin: '' });
                  }}
                  className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rooms List */}
      <div className="p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Default Rooms */}
          <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
            <h3 className="text-lg font-semibold mb-2"># general</h3>
            <p className="text-gray-600 mb-4">General discussion room</p>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-600 bg-green-100 px-2 py-1 rounded">Public</span>
              <button
                onClick={() => joinRoom('general')}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Join
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
            <h3 className="text-lg font-semibold mb-2"># tech</h3>
            <p className="text-gray-600 mb-4">Technology discussions</p>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-600 bg-green-100 px-2 py-1 rounded">Public</span>
              <button
                onClick={() => joinRoom('tech')}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Join
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
            <h3 className="text-lg font-semibold mb-2"># random</h3>
            <p className="text-gray-600 mb-4">Random topics and discussions</p>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-600 bg-green-100 px-2 py-1 rounded">Public</span>
              <button
                onClick={() => joinRoom('random')}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Join
              </button>
            </div>
          </div>

          {/* Custom Rooms */}
          {rooms.map((room) => (
            <div key={room.room_id} className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
              <h3 className="text-lg font-semibold mb-2"># {room.room_name}</h3>
              <p className="text-gray-600 mb-4">{room.description || 'No description'}</p>
              <div className="flex justify-between items-center">
                <span className={`text-sm px-2 py-1 rounded ${
                  room.is_private 
                    ? 'text-orange-600 bg-orange-100' 
                    : 'text-green-600 bg-green-100'
                }`}>
                  {room.is_private ? 'Private' : 'Public'}
                </span>
                <button
                  onClick={() => joinRoom(room.room_id)}
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
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
            <p className="text-gray-600">No custom rooms created yet. Create your first room!</p>
          </div>
        )}
      </div>
    </div>
  );
}