import { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export default function Login() {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!validateEmail(email)) {
      newErrors.email = "Please enter a valid email address.";
    }
    if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await login(email, password);
      // login will handle navigation on success
    } catch (error) {
      console.error("Login failed", error);
      // Optionally show a general error message
      setErrors(prev => ({ ...prev, general: "Invalid email or password." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-lg rounded-2xl p-8 w-96"
      >
        <h2 className="text-2xl font-bold text-center mb-4">🔐 Login</h2>

        <input
          type="email"
          placeholder="Email"
          className={`border p-2 rounded w-full mb-1 ${
            errors.email ? "border-red-500" : "border-gray-300"
          }`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => {
            if (!validateEmail(email)) {
              setErrors((prev) => ({
                ...prev,
                email: "Please enter a valid email address.",
              }));
            } else {
              setErrors((prev) => ({ ...prev, email: "" }));
            }
          }}
          required
        />
        {errors.email && <p className="text-red-500 text-sm mb-3">{errors.email}</p>}

        <input
          type="password"
          placeholder="Password"
          className={`border p-2 rounded w-full mb-1 ${
            errors.password ? "border-red-500" : "border-gray-300"
          }`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => {
            if (password.length < 6) {
              setErrors((prev) => ({
                ...prev,
                password: "Password must be at least 6 characters.",
              }));
            } else {
              setErrors((prev) => ({ ...prev, password: "" }));
            }
          }}
          required
        />
        {errors.password && (
          <p className="text-red-500 text-sm mb-4">{errors.password}</p>
        )}

        {errors.general && (
          <p className="text-red-500 text-sm mb-4 text-center">{errors.general}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded w-full disabled:bg-blue-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
