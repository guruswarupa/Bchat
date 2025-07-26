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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentRoom, setCurrentRoom] = useState('general');
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pendingRoom, setPendingRoom] = useState('');
  const [roomPin, setRoomPin] = useState('');

  const getApiBase = () => {
    return 'http://localhost:5000';
  };

  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/rooms/${currentRoom}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      // Ensure data is an array and filter by current room
      const roomMessages = Array.isArray(data) ? data.filter(msg => msg.room_id === currentRoom) : [];
      setMessages(roomMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]); // Set empty array on error
    }
  };

  const switchRoom = async (roomId: string, roomType?: string) => {
    if (roomType === 'private' || roomId !== 'general') {
      // Check if room requires PIN
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:5000/api/rooms/${roomId}/verify-pin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ pin: '' })
        });

        if (response.status === 401) {
          // Room requires PIN
          setPendingRoom(roomId);
          setShowPinDialog(true);
          return;
        }
      } catch (error) {
        console.error('Error checking room:', error);
      }
    }

    // Clear current room data immediately
    setMessages([]);
    setOnlineUsers([]);
    
    // Update current room state
    setCurrentRoom(roomId);
    
    // Switch to room via socket
    if (socket && socket.connected) {
      console.log(`Switching to room: ${roomId}`);
      socket.emit('join_room', roomId);
    }
  };

  const verifyPin = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/rooms/${pendingRoom}/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pin: roomPin })
      });

      if (response.ok) {
        // PIN verified, switch to room
        setMessages([]);
        setOnlineUsers([]);
        setCurrentRoom(pendingRoom);
        
        if (socket && socket.connected) {
          console.log(`Switching to verified room: ${pendingRoom}`);
          socket.emit('join_room', pendingRoom);
        }
        
        setShowPinDialog(false);
        setRoomPin('');
        setPendingRoom('');
      } else {
        alert('Invalid PIN');
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      alert('Error verifying PIN');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiBase = getApiBase();

      const url = isRegistering
        ? `${apiBase}/api/auth/register`
        : `${apiBase}/api/auth/login`;

      const payload = isRegistering
        ? { username: loginForm.username, email, password: loginForm.password }
        : { username: loginForm.username, password: loginForm.password };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('user_id', data.user.user_id);
        localStorage.setItem('username', data.user.username);
        setUsername(data.user.username);
        setCurrentUser(data.user);
        setIsLoggedIn(true);
      } else {
        alert(isRegistering ? 'Registration failed' : 'Login failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
      alert(isRegistering ? 'Registration failed' : 'Login failed');
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && socket && socket.connected) {
      const userId = localStorage.getItem('user_id');
      console.log('Sending message:', { room_id: currentRoom, sender_id: userId, content: newMessage });
      
      socket.emit('send_message', {
        room_id: currentRoom,
        sender_id: userId,
        content: newMessage,
        message_type: 'text'
      });
      setNewMessage('');
    } else {
      console.error('Cannot send message:', { 
        hasMessage: !!newMessage.trim(), 
        hasSocket: !!socket, 
        socketConnected: socket?.connected 
      });
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
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/upload`, {
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
      const socketUrl = getApiBase();

      const newSocket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        forceNew: true,
        timeout: 20000
      });

      newSocket.on('connect', () => {
        console.log('Connected to server with socket ID:', newSocket.id);
        
        const userId = localStorage.getItem('user_id');
        const storedUsername = localStorage.getItem('username') || username;
        
        // Join as user
        newSocket.emit('user_join', {
          user_id: userId,
          username: storedUsername
        });

        // Join current room after a brief delay to ensure user_join is processed
        setTimeout(() => {
          newSocket.emit('join_room', currentRoom);
          // Fetch messages for the current room
          fetchMessages();
        }, 100);
      });

      newSocket.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
      });

      newSocket.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
      });

      // Listen for new messages
      newSocket.on('new_message', (message: Message) => {
        console.log('Received message for room:', message.room_id, 'current room:', currentRoom);
        // Only add message if it's for the current room
        if (message.room_id === currentRoom) {
          setMessages(prev => [...prev, message]);
        }
      });

      // Listen for user updates (room-specific)
      newSocket.on('users_update', (users: User[]) => {
        console.log('Users update for current room:', users);
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

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [isLoggedIn, currentRoom, username]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    const storedUserId = localStorage.getItem('user_id');
    
    if (token && storedUsername) {
      setUsername(storedUsername);
      setCurrentUser({ user_id: storedUserId, username: storedUsername });
      setIsLoggedIn(true);
    }

    // Check URL parameters for room
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setCurrentRoom(roomParam);
    }
  }, []);

  // Update URL when room changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    window.history.replaceState({}, '', url.toString());
  }, [currentRoom]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96">
          <h1 className="text-2xl font-bold mb-6 text-center">
            {isRegistering ? 'Register to Chat' : 'Login to Chat'}
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            {isRegistering && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            )}
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
              {isRegistering ? 'Register' : 'Login'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
              }}
              className="w-full text-blue-600  py-2 rounded-md hover:text-blue-700"
            >
              {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
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
          <h3 className="font-semibold mb-2">Rooms</h3>
          <div className="space-y-2">
            <button
              onClick={() => switchRoom('general')}
              className={`block w-full text-left px-2 py-1 rounded ${
                currentRoom === 'general' ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'
              }`}
            >
              # general
            </button>
            <button
              onClick={() => switchRoom('tech')}
              className={`block w-full text-left px-2 py-1 rounded ${
                currentRoom === 'tech' ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'
              }`}
            >
              # tech
            </button>
            <button
              onClick={() => switchRoom('random')}
              className={`block w-full text-left px-2 py-1 rounded ${
                currentRoom === 'random' ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'
              }`}
            >
              # random
            </button>
          </div>
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

        {/* PIN Dialog */}
        {showPinDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Enter Room PIN</h3>
              <input
                type="password"
                value={roomPin}
                onChange={(e) => setRoomPin(e.target.value)}
                className="w-full px-3 py-2 border rounded-md mb-4"
                placeholder="Enter PIN"
                onKeyPress={(e) => e.key === 'Enter' && verifyPin()}
              />
              <div className="flex space-x-2">
                <button
                  onClick={verifyPin}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Verify
                </button>
                <button
                  onClick={() => {
                    setShowPinDialog(false);
                    setRoomPin('');
                    setPendingRoom('');
                  }}
                  className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {Array.isArray(messages) && messages.map((message) => (
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