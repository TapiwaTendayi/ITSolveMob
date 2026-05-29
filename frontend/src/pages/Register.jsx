import { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export default function Register() {
  const { register } = useContext(AuthContext);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("office");

  const handleSubmit = (e) => {
    e.preventDefault();
    register(name, email, password, role);
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-lg rounded-2xl p-8 w-96"
      >
        <h2 className="text-2xl font-bold text-center mb-4">📝 Register</h2>
        <input
          type="text"
          placeholder="Full Name"
          className="border p-2 rounded w-full mb-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          className="border p-2 rounded w-full mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="border p-2 rounded w-full mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select
          className="border p-2 rounded w-full mb-4"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="office">Office</option>
          <option value="student">Student</option>
          <option value="supervisor">System Administration</option>
        </select>
        <button
          type="submit"
          className="bg-green-600 hover:bg-green-700 text-white py-2 rounded w-full"
        >
          Register
        </button>
      </form>
    </div>
  );
}
