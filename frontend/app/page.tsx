'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    // For any room that's not the default public rooms, check if it requires PIN
    const publicRooms = ['general', 'tech', 'random'];
    if (!publicRooms.includes(roomId)) {
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">
        <div className="bg-[#2c2c2e] p-8 rounded-xl shadow-xl w-full max-w-md">
          <h1 className="text-2xl font-semibold mb-6 text-center">
            {isRegistering ? 'Register to Chat' : 'Login to Chat'}
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            {isRegistering && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            )}
            <input
              type="text"
              placeholder="Username"
              value={loginForm.username}
              onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
              className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md"
            >
              {isRegistering ? 'Register' : 'Login'}
            </button>
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="w-full text-blue-400 hover:text-blue-300 text-sm mt-2"
            >
              {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-white flex flex-col lg:flex-row">
      {/* Mobile Header - Shows room info and hamburger menu */}
      <div className="lg:hidden bg-[#2c2c2e] p-4 border-b border-[#3a3a3c] flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold">#{currentRoom}</h1>
          <p className="text-xs text-gray-400">Welcome, {username}!</p>
        </div>
        <button 
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
          className="bg-[#48484a] hover:bg-[#5c5c5e] px-3 py-2 rounded-md"
        >
          ☰
        </button>
      </div>

      {/* Sidebar - Hidden on mobile by default */}
      <aside className={`
        lg:w-64 w-full bg-[#2c2c2e] border-r border-[#3a3a3c]
        lg:block ${showMobileSidebar ? 'block' : 'hidden'}
        lg:relative absolute lg:h-screen h-[calc(100vh-80px)] z-20 flex flex-col
      `}>
        {/* Mobile close button - Fixed header */}
        <div className="lg:hidden flex justify-between items-center p-4 border-b border-[#3a3a3c] flex-shrink-0">
          <h2 className="text-lg font-semibold">Menu</h2>
          <button 
            onClick={() => setShowMobileSidebar(false)}
            className="bg-[#48484a] hover:bg-[#5c5c5e] px-3 py-2 rounded-md text-white"
          >
            ✕
          </button>
        </div>
        
        {/* Desktop header - Fixed */}
        <div className="hidden lg:block p-4 border-b border-[#3a3a3c] flex-shrink-0">
          <h2 className="text-lg font-semibold">Online Users ({onlineUsers.length})</h2>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Mobile users header */}
          <div className="lg:hidden">
            <h3 className="text-md font-medium mb-4">Online Users ({onlineUsers.length})</h3>
          </div>

          {/* Online Users List - Scrollable */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {onlineUsers.map((user) => (
              <div key={user.user_id} className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></span>
                <span className="text-sm text-white truncate">{user.username}</span>
              </div>
            ))}
          </div>

          {/* Rooms Section */}
          <div>
            <h3 className="text-sm font-medium mb-2">Rooms</h3>
            <div className="space-y-1">
              {['general', 'tech', 'random'].map((room) => (
                <button
                  key={room}
                  onClick={() => {
                    switchRoom(room);
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full text-left px-2 py-2 rounded text-sm transition-colors ${
                    currentRoom === room
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-[#3a3a3c] text-gray-300'
                  }`}
                >
                  # {room}
                </button>
              ))}
            </div>
          </div>

          {/* Navigation Links */}
          <div className="text-sm space-y-2">
            <a href="/rooms" className="block text-blue-400 hover:underline">Manage Rooms</a>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-screen lg:h-full">
        {/* Desktop Header - Always visible */}
        <header className="hidden lg:block bg-[#2c2c2e] p-4 border-b border-[#3a3a3c] flex-shrink-0">
          <h1 className="text-lg font-bold">#{currentRoom}</h1>
          <p className="text-xs text-gray-400">Welcome, {username}!</p>
        </header>

        {/* Messages Container - Scrollable */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 sm:space-y-4 scroll-smooth">
          {messages.map((msg) => (
            <div key={msg.message_id} className="bg-[#3a3a3c] p-2 sm:p-3 rounded-xl shadow">
              <div className="flex flex-col sm:flex-row sm:items-center text-sm text-gray-300 mb-1 space-y-1 sm:space-y-0">
                <span className="font-semibold text-white sm:mr-2">{msg.username}</span>
                <span className="text-xs sm:text-sm">{new Date(msg.timestamp || msg.created_at || '').toLocaleTimeString()}</span>
                {msg.blockchain_hash && (
                  <span className="sm:ml-2 text-green-400 text-xs">🔗 Verified</span>
                )}
              </div>
              <p className="text-white text-sm break-words">{msg.content}</p>
              {msg.message_type === 'file' && msg.file_url && (
                <a
                  href={msg.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-xs block mt-2"
                >
                  📎 Download File
                </a>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input - Fixed at bottom */}
        <footer className="bg-[#2c2c2e] p-2 sm:p-4 border-t border-[#3a3a3c] flex-shrink-0">
          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-3 py-2 rounded-md bg-[#3a3a3c] border border-[#48484a] text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <label className="cursor-pointer bg-[#48484a] hover:bg-[#5c5c5e] px-2 sm:px-4 py-2 rounded-md flex-shrink-0">
              📎
              <input type="file" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 px-3 sm:px-6 py-2 rounded-md text-white text-sm flex-shrink-0"
            >
              Send
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
}