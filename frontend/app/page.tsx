'use client';

import { useState, useEffect } from 'react';
import io from 'socket.io-client';

interface Message {
  message_id: string;
  user_id: string;
  username: string;
  room_id: string;
  content: string;
  message_type: string;
  timestamp: string;
  created_at?: string;
  file_url?: string;
  blockchain_hash?: string;
}

interface User {
  user_id: string;
  username: string;
  is_online: boolean;
}

export default function ChatDashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentRoom, setCurrentRoom] = useState('general');
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://0.0.0.0:5000/api/rooms/${currentRoom}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('http://0.0.0.0:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('user_id', data.user.user_id);
        setUsername(data.user.username);
        setIsLoggedIn(true);
      } else {
        alert('Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('send_message', {
        room_id: currentRoom,
        sender_id: localStorage.getItem('user_id'),
        content: newMessage,
        message_type: 'text'
      });
      setNewMessage('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('room_id', currentRoom);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://0.0.0.0:5000/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('File uploaded:', result);
        e.target.value = ''; // Reset file input
      }
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  useEffect(() => {
    if (isLoggedIn && username) {
      // Create Socket.IO connection
      const newSocket = io('http://0.0.0.0:5000', {
        transports: ['websocket', 'polling']
      });
      setSocket(newSocket);

      // Join as user
      newSocket.emit('user_join', {
        user_id: localStorage.getItem('user_id') || username,
        username: username
      });

      // Join current room
      newSocket.emit('join_room', currentRoom);

      // Listen for new messages
      newSocket.on('new_message', (message: Message) => {
        console.log('Received message:', message);
        setMessages(prev => [...prev, message]);
      });

      // Listen for user updates
      newSocket.on('users_update', (users: User[]) => {
        console.log('Users update:', users);
        setOnlineUsers(users);
      });

      // Listen for user joined room
      newSocket.on('user_joined_room', (data: any) => {
        console.log('User joined room:', data);
      });

      // Listen for typing indicators
      newSocket.on('user_typing', (data: any) => {
        console.log('User typing:', data);
      });

      newSocket.on('user_stop_typing', (data: any) => {
        console.log('User stopped typing:', data);
      });

      // Fetch initial messages
      fetchMessages();

      return () => {
        newSocket.close();
      };
    }
  }, [isLoggedIn, currentRoom, username]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Auto-login if token exists
      setIsLoggedIn(true);
      // You might want to verify the token here
    }
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96">
          <h1 className="text-2xl font-bold mb-6 text-center">Login to Chat</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              value={loginForm.username}
              onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg p-4">
        <h2 className="text-xl font-bold mb-4">Online Users ({onlineUsers.length})</h2>
        <div className="space-y-2">
          {onlineUsers.map((user) => (
            <div key={user.user_id} className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">{user.username}</span>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <h3 className="font-semibold mb-2">Navigation</h3>
          <div className="space-y-2">
            <a href="/rooms" className="block text-blue-600 hover:underline">Manage Rooms</a>
            <a href="/files" className="block text-blue-600 hover:underline">Shared Files</a>
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm p-4 border-b">
          <h1 className="text-xl font-semibold">#{currentRoom}</h1>
          <p className="text-sm text-gray-600">Welcome, {username}!</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div key={message.message_id} className="bg-white p-3 rounded-lg shadow-sm">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-blue-600">{message.username}</span>
                <span className="text-xs text-gray-500">
                  {new Date(message.timestamp || message.created_at || '').toLocaleTimeString()}
                </span>
                {message.blockchain_hash && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    🔗 Verified
                  </span>
                )}
              </div>
              <p className="text-gray-800">{message.content}</p>
              {message.message_type === 'file' && message.file_url && (
                <a
                  href={message.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  📎 Download File
                </a>
              )}
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 cursor-pointer">
              📎
              <input
                type="file"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
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