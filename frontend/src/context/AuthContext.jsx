import toast from "react-hot-toast";
import { createContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Restore user and verify token on page refresh
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem("token");
      const savedUser = localStorage.getItem("user");

      if (savedToken && savedUser) {
        // Set them immediately so the app doesn't flash login screen
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        
        // Verify the token is still valid with the server
        try {
          const { data } = await api.get("/auth/me");
          setUser(data.user);
          setToken(savedToken);
        } catch (err) {
          // Token is invalid or expired - clear everything
          console.log("Token expired or invalid, clearing auth");
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setUser(null);
          setToken(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  // Listen for server-initiated force-logout (account deactivated by admin)
  useEffect(() => {
    const handleForceLogout = (e) => {
      const msg = e.detail?.message || "Your account has been deactivated.";
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
      setToken(null);
      // Small delay so the toast renders before the navigate
      setTimeout(() => {
        toast.error(msg);
        navigate("/login");
      }, 100);
    };
    window.addEventListener("itsolve:force-logout", handleForceLogout);
    return () => window.removeEventListener("itsolve:force-logout", handleForceLogout);
  }, [navigate]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      setToken(data.token);
      navigate(`/dashboard/${data.user.role}`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed. Please check your credentials and try again.");
    }
  };

  const register = async (name, email, password, role) => {
    try {
      const { data } = await api.post("/auth/register", {
        name,
        email,
        password,
        role,
      });
      toast.success(data.message || "Registration successful! You can now log in.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.message || "Registration failed. Please try again.");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
    navigate("/login");
  };

  // Don't render children until auth is initialized
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
};