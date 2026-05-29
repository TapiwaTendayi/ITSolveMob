// frontend/src/components/ChatWindow.jsx
import { useEffect, useRef, useState, useContext } from "react";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import toast from "react-hot-toast";

const ChatWindow = ({ requestId, requestTitle, onClose, onMessageRead }) => {
  const { user: currentUser, token } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const socket = useRef(null);
  const typingTimeoutRef = useRef(null);
  const hasMarkedReadRef = useRef(false);

  const apiWithAuth = axios.create({
    baseURL:'/api',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  // Helper to format role display name
  const getRoleDisplay = (role) => {
    if (role === 'supervisor') return 'System Administrator';
    if (role === 'office') return 'Office User';
    if (role === 'student') return 'Student';
    return role || 'User';
  };

  if (!currentUser || !currentUser._id) {
    return <div className="p-4 text-center text-gray-500">Loading chat...</div>;
  }

  // Mark messages as read via HTTP
  const markMessagesAsRead = async () => {
    if (hasMarkedReadRef.current) return;
    
    try {
      console.log(`📖 Marking messages as read for request ${requestId}`);
      const response = await apiWithAuth.post(`/messages/mark-read/${requestId}`);
      console.log(`✅ Mark read response:`, response.data);
      hasMarkedReadRef.current = true;
      if (onMessageRead) onMessageRead();
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  };

  // Fetch initial messages
  const fetchMessages = async () => {
    try {
      const { data } = await apiWithAuth.get(`/messages/${requestId}`);
      console.log(`📨 Fetched ${data.length} messages for request ${requestId}`);
      setMessages(data);
      
      // Check if there are any unread messages from others
      const hasUnread = data.some(msg => 
        msg.sender !== currentUser._id && 
        (!msg.readBy || !msg.readBy.includes(currentUser._id))
      );
      
      if (hasUnread && chatContainerRef.current) {
        await markMessagesAsRead();
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  };

  // Initialize socket connection
  useEffect(() => {
    let isMounted = true;

    const initSocket = async () => {
      const { connectSocket, getSocket } = await import("../utils/socket");
      socket.current = getSocket() || connectSocket(currentUser._id, currentUser.role);
      
      if (!socket.current) {
        console.error("Failed to initialize socket");
        return;
      }
      
      // Join the specific chat room
      socket.current.emit("join_chat", { requestId });
      console.log(`Joined chat room for request: ${requestId}`);
      
      // Listen for new messages
      socket.current.on("new-message", (data) => {
        if (data.requestId === requestId && isMounted) {
          console.log("New message received:", data.message);
          setMessages(prev => {
            // Check if message already exists (prevent duplicates)
            const exists = prev.some(m => m._id === data.message._id);
            if (exists) return prev;
            
            const newMessages = [...prev, data.message];
            
            // Auto-mark as read if the message is from someone else and chat is visible
            if (data.message.sender !== currentUser._id && chatContainerRef.current) {
              setTimeout(() => markMessagesAsRead(), 500);
            }
            
            return newMessages;
          });
        }
      });
      
      // Update message status to delivered
      socket.current.on("message-delivered", ({ messageId, requestId: reqId }) => {
        if (reqId === requestId && isMounted) {
          setMessages(prev => prev.map(msg => 
            msg._id === messageId ? { ...msg, status: "delivered" } : msg
          ));
        }
      });
      
      // Update message status to read
      socket.current.on("messages-read", ({ requestId: reqId, userId, messageIds }) => {
        if (reqId === requestId && userId !== currentUser._id && isMounted) {
          console.log(`Messages marked as read by ${userId}:`, messageIds);
          setMessages(prev => prev.map(msg => 
            messageIds.includes(msg._id) ? { ...msg, status: "read", readBy: [...(msg.readBy || []), userId] } : msg
          ));
        }
      });
      
      // Handle typing indicators
      socket.current.on("user-typing", ({ userId, isTyping: typing }) => {
        if (userId !== currentUser._id && isMounted) {
          setOtherUserTyping(typing);
        }
      });
    };
    
    initSocket();
    
    return () => {
      isMounted = false;
      hasMarkedReadRef.current = false;
      if (socket.current) {
        socket.current.off("new-message");
        socket.current.off("message-delivered");
        socket.current.off("messages-read");
        socket.current.off("user-typing");
      }
    };
  }, [requestId, currentUser._id]);

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages();
  }, [requestId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read when chat becomes visible - WITH DELAY
  useEffect(() => {
    let timeoutId = null;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && messages.length > 0) {
          const hasUnread = messages.some(msg => 
            msg.sender !== currentUser._id && 
            (!msg.readBy || !msg.readBy.includes(currentUser._id))
          );
          if (hasUnread) {
            // Add a 2-second delay to ensure user actually sees the messages
            timeoutId = setTimeout(() => {
              markMessagesAsRead();
            }, 2000);
          }
        }
      },
      { threshold: 0.5 }
    );
    
    if (chatContainerRef.current) {
      observer.observe(chatContainerRef.current);
    }
    
    return () => {
      if (chatContainerRef.current) {
        observer.unobserve(chatContainerRef.current);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [messages, currentUser._id]);

  // Handle typing indicator
  const handleTyping = () => {
    if (!socket.current) return;
    
    socket.current.emit("typing", { requestId, isTyping: true });
    
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (socket.current) {
        socket.current.emit("typing", { requestId, isTyping: false });
      }
    }, 1000);
  };

  // Send message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket.current) return;
    
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const messageContent = newMessage;
    
    // Optimistic UI update
    const optimisticMessage = {
      _id: tempId,
      content: messageContent,
      sender: currentUser._id,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      status: "sending",
      createdAt: new Date().toISOString(),
      readBy: [currentUser._id]
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage("");
    
    // Reset the mark read flag since there will be new unread messages
    hasMarkedReadRef.current = false;
    
    // Send via socket
    socket.current.emit("send_message", {
      requestId,
      content: messageContent,
      tempId
    });
  };

  // Get message status icon
  const getMessageStatus = (message) => {
    if (message.sender !== currentUser._id) return null;
    
    switch (message.status) {
      case "sending":
        return <span className="text-gray-400 text-xs ml-2">⌛ Sending...</span>;
      case "sent":
        return <span className="text-gray-400 text-xs ml-2">✓</span>;
      case "delivered":
        return <span className="text-gray-500 text-xs ml-2">✓✓</span>;
      case "read":
        return <span className="text-blue-500 text-xs ml-2">✓✓</span>;
      default:
        return null;
    }
  };

  // Check if message is read
  const isMessageRead = (message) => {
    if (message.sender !== currentUser._id) return false;
    return message.status === "read" || (message.readBy && message.readBy.length > 1);
  };

  return (
    <div className="bg-white rounded-lg shadow-xl flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b bg-blue-500 text-white rounded-t-lg">
        <div>
          <h3 className="font-semibold">Chat: {requestTitle || 'Request'}</h3>
          <p className="text-xs opacity-75">
            {otherUserTyping ? "Typing..." : "Chat with System Administration"}
          </p>
        </div>
        <button onClick={onClose} className="text-white hover:text-gray-200 text-xl">×</button>
      </div>

      {/* Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            No messages yet. Start a conversation!
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg._id}
                className={`flex ${msg.sender === currentUser._id ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    msg.sender === currentUser._id
                      ? "bg-blue-500 text-white"
                      : "bg-white text-gray-800 shadow"
                  }`}
                >
                  {msg.sender !== currentUser._id && (
                    <div className="text-xs font-semibold mb-1 text-blue-600">
                      {msg.senderName} ({getRoleDisplay(msg.senderRole)})
                    </div>
                  )}
                  <div className="text-sm break-words">{msg.content}</div>
                  <div className="text-xs mt-1 opacity-75 flex items-center justify-end gap-1">
                    <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                    {getMessageStatus(msg)}
                    {isMessageRead(msg) && (
                      <span className="text-green-500 ml-1">✓✓ Read</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 bg-white border-t rounded-b-lg">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow;