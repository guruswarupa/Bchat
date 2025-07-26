
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Room {
  room_id: string;
  room_name: string;
  description: string;
  room_type: string;
  created_at: string;
  member_count?: number;
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoom, setNewRoom] = useState({
    room_name: '',
    description: '',
    room_type: 'public'
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/rooms', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      // Ensure data is an array
      setRooms(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setRooms([]); // Set empty array on error
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/rooms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newRoom)
      });
      
      if (response.ok) {
        setNewRoom({ room_name: '', description: '', room_type: 'public' });
        setShowCreateForm(false);
        fetchRooms();
      }
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">💬 Chat Rooms</h1>
            <p className="text-gray-600">Manage and join chat rooms</p>
          </div>
          <div className="space-x-4">
            <Link href="/" className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700">
              ← Back to Chat
            </Link>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              + Create Room
            </button>
          </div>
        </div>

        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Create New Room</h2>
            <form onSubmit={createRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Room Name</label>
                <input
                  type="text"
                  value={newRoom.room_name}
                  onChange={(e) => setNewRoom(prev => ({ ...prev, room_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={newRoom.description}
                  onChange={(e) => setNewRoom(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Room Type</label>
                <select
                  value={newRoom.room_type}
                  onChange={(e) => setNewRoom(prev => ({ ...prev, room_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Create Room
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div key={room.room_id} className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">#{room.room_name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  room.room_type === 'public' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {room.room_type}
                </span>
              </div>
              <p className="text-gray-600 mb-4">{room.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Created: {new Date(room.created_at).toLocaleDateString()}
                </span>
                <Link
                  href={`/?room=${room.room_id}`}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  Join
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
