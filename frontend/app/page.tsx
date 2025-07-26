
'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  message_id: string;
  user_id: string;
  username: string;
  room_id: string;
  content: string;
  message_type: string;
  timestamp: string;
  blockchain_hash?: string;
}

interface User {
  user_id: string;
  username: string;
  is_online: boolean;
}

export default function ChatDashboard() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentRoom, setCurrentRoom] = useState('general');
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  useEffect(() => {
    if (isLoggedIn) {
      const newSocket = io('http://localhost:5000');
      setSocket(newSocket);

      newSocket.on('message', (message: Message) => {
        setMessages(prev => [...prev, message]);
      });

      newSocket.on('userJoined', (user: User) => {
        setOnlineUsers(prev => [...prev.filter(u => u.user_id !== user.user_id), user]);
      });

      newSocket.on('userLeft', (userId: string) => {
        setOnlineUsers(prev => prev.filter(u => u.user_id !== userId));
      });

      newSocket.emit('joinRoom', { room: currentRoom, username });

      return () => {
        newSocket.close();
      };
    }
  }, [isLoggedIn, currentRoom, username]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoggedIn(true);
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('sendMessage', {
        room: currentRoom,
        message: newMessage,
        username
      });
      setNewMessage('');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-6">💬 BChat</h1>
          <p className="text-gray-600 text-center mb-6">Blockchain-powered secure messaging</p>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
            >
              Join Chat
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">💬 BChat</h1>
          <p className="text-sm text-gray-600">Welcome, {username}</p>
        </div>
        
        <div className="p-4">
          <h3 className="font-semibold mb-2">Rooms</h3>
          <div 
            className={`p-2 rounded cursor-pointer ${currentRoom === 'general' ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
            onClick={() => setCurrentRoom('general')}
          >
            # General
          </div>
        </div>

        <div className="p-4 border-t">
          <h3 className="font-semibold mb-2">Online Users ({onlineUsers.length})</h3>
          <div className="space-y-1">
            {onlineUsers.map(user => (
              <div key={user.user_id} className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm">{user.username}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b p-4">
          <h2 className="font-semibold">#{currentRoom}</h2>
          <p className="text-sm text-gray-600">Secure messaging with blockchain verification</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div key={message.message_id} className="bg-white rounded-lg p-3 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-blue-600">{message.username}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                  {message.blockchain_hash && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      🔗 Verified
                    </span>
                  )}
                </div>
              </div>
              <p className="text-gray-800">{message.content}</p>
            </div>
          ))}
        </div>

        {/* Message Input */}
        <div className="bg-white border-t p-4">
          <form onSubmit={sendMessage} className="flex space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
